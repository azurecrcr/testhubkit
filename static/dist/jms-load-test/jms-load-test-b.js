/* ---- js/jms_json_post_extract_sync.js ---- */
/**
 * JSON PostProcessor ↔ extractors 展示同步（隔离模块，不影响导出去重逻辑）
 */
(function (global) {
    'use strict';

    function jsonPostToExtractor(proc) {
        if (!proc || proc.type !== 'json_post') return null;
        var varName = proc.var != null ? String(proc.var).trim() : '';
        var jsonPath = proc.json_path != null ? String(proc.json_path).trim() : '';
        if (!varName || !jsonPath) return null;
        var ex = { var: varName, json_path: jsonPath };
        if (proc.match_numbers !== undefined && String(proc.match_numbers) !== '0') {
            ex.match_numbers = String(proc.match_numbers);
        }
        if (proc.default_value !== undefined && String(proc.default_value) !== '') {
            ex.default_value = String(proc.default_value);
        }
        return ex;
    }

    function collectJsonPostExtractors(step) {
        var list = [];
        if (!step || !Array.isArray(step.processors)) return list;
        step.processors.forEach(function (p) {
            var ex = jsonPostToExtractor(p);
            if (ex) list.push(ex);
        });
        return list;
    }

    /** 导入/YAML 加载后：将 json_post 后置处理器镜像到 extractors 供 UI 展示 */
    function syncExtractorsFromJsonPostProcessors(step) {
        if (!step || typeof step !== 'object') return step;
        var fromProc = collectJsonPostExtractors(step);
        if (!fromProc.length) return step;

        var existing = Array.isArray(step.extractors) ? step.extractors.slice() : [];
        var seen = {};
        existing.forEach(function (ex) {
            if (ex && ex.var) seen[String(ex.var).trim()] = true;
        });
        fromProc.forEach(function (ex) {
            if (seen[ex.var]) return;
            seen[ex.var] = true;
            existing.push(ex);
        });
        step.extractors = existing;
        if (existing.length) {
            step.extract_var = existing[0].var;
            step.extract_json_path = existing[0].json_path;
            step.extract = { var: existing[0].var, json_path: existing[0].json_path };
        }
        return step;
    }

    /** 只读合并 extractors 与 json_post processors，供行内徽章/编辑抽屉 */
    function normalizeExtractorsForDisplay(step) {
        var list = [];
        var seen = {};
        if (!step || typeof step !== 'object') return list;

        function push(ex) {
            if (!ex || !ex.var || !ex.json_path) return;
            var v = String(ex.var).trim();
            if (seen[v]) return;
            seen[v] = true;
            list.push({ var: v, json_path: String(ex.json_path).trim() });
        }

        if (Array.isArray(step.extractors)) step.extractors.forEach(push);
        collectJsonPostExtractors(step).forEach(push);
        if (!list.length) {
            var v = step.extract_var != null ? String(step.extract_var).trim() : '';
            var p = step.extract_json_path != null ? String(step.extract_json_path).trim() : '';
            if (v && p) list.push({ var: v, json_path: p });
        }
        return list;
    }

    global.JmsJsonPostExtractSync = {
        jsonPostToExtractor: jsonPostToExtractor,
        collectJsonPostExtractors: collectJsonPostExtractors,
        syncExtractorsFromJsonPostProcessors: syncExtractorsFromJsonPostProcessors,
        normalizeExtractorsForDisplay: normalizeExtractorsForDisplay
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_hierarchy_rules.js ---- */
/**
 * JMeter Studio V2 · 前端层级规则（与 component_hierarchy_rules.py 对齐）
 */
(function (global) {
    'use strict';
    var THREAD_GROUP_ALIASES = {
        ThreadGroup: 1, SetupThreadGroup: 1, PostThreadGroup: 1, OpenModelThreadGroup: 1,
        'Custom Thread Groups': 1
    };
    var CATEGORY_BY_CONTEXT = {
        test_plan: { thread_group: 1, config: 1, listener: 1, other: 1 },
        thread_group: { controller: 1, sampler: 1, config: 1, timer: 1, preprocessor: 1, postprocessor: 1, assertion: 1, listener: 1 },
        controller: { controller: 1, sampler: 1, config: 1, timer: 1, preprocessor: 1, postprocessor: 1, assertion: 1, listener: 1 },
        sampler_child: { timer: 1, preprocessor: 1, postprocessor: 1, assertion: 1, config: 1 }
    };
    var PLAN_LEVEL_CONFIG_ALIASES = {
        HeaderManager: 1, Arguments: 1, CookieManager: 1, CacheManager: 1, AuthManager: 1,
        CSVDataSet: 1, CounterConfig: 1, RandomVariableConfig: 1, DNSCacheManager: 1,
        KeystoreConfig: 1, LoginConfig: 1, ConfigTestElement: 1
    };
    function effectiveCategory(comp, context) {
        var cat = comp.category || 'other';
        var alias = comp.alias || '';
        if (context === 'test_plan' && PLAN_LEVEL_CONFIG_ALIASES[alias]) return 'config';
        return cat;
    }
    global.JmsHierarchyRules = {
        effectiveCategory: effectiveCategory,
        componentAllowed: function (comp, context) {
            if (!comp) return false;
            var cat = effectiveCategory(comp, context);
            var alias = comp.alias || '';
            var allowed = CATEGORY_BY_CONTEXT[context] || CATEGORY_BY_CONTEXT.thread_group;
            if (!allowed[cat]) return false;
            if (THREAD_GROUP_ALIASES[alias] && context !== 'test_plan') return false;
            if (cat === 'thread_group' && context !== 'test_plan') return false;
            if (cat === 'sampler' && (context === 'test_plan' || context === 'sampler_child')) return false;
            if (context === 'sampler_child' && (cat === 'listener' || cat === 'controller')) return false;
            return true;
        },
        CATEGORY_BY_CONTEXT: CATEGORY_BY_CONTEXT
    };
})(window);

/* ---- js/jms_insert_context_v2.js ---- */
/**
 * JMeter Studio V2 · 插入上下文解析（hashTree 语义，隔离模块）
 */
(function (global) {
    'use strict';

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === String(stepId)) return s;
            if (Array.isArray(s.children)) {
                var n = findStepInList(s.children, stepId);
                if (n) return n;
            }
        }
        return null;
    }

    var LOGIC_TYPES = ['if_controller', 'random_controller', 'simple_controller', 'transaction_controller', 'loop_controller'];

    function isLogicContainer(step) {
        if (isCatalogContainer(step)) return true;
        return step && LOGIC_TYPES.indexOf(step.type) >= 0;
    }

    function isCatalogContainer(step) {
        return !!(step && step.type === 'catalog_element' && step.container);
    }

    function isContainer(step) {
        return isLogicContainer(step) || isCatalogContainer(step);
    }

    function isHttpSampler(step) {
        if (step && step.type === 'catalog_element' && step.alias === 'HTTPSamplerProxy') return true;
        return !!(step && step.method && !step.type);
    }

    function isDebugSampler(step) {
        return step && step.type === 'debug_sampler';
    }

    function isSamplerStep(step) {
        return isHttpSampler(step) || isDebugSampler(step) || (step && step.type === 'catalog_element' && step.category === 'sampler');
    }

    function getActiveTg(vb) {
        if (!vb || typeof vb.resolveActiveThreadGroupContext !== 'function') return null;
        var tgCtx = vb.resolveActiveThreadGroupContext();
        if (!tgCtx) return null;
        var model = vb.getModel && vb.getModel();
        if (!model) return tgCtx;
        var plan = (model.test_plans || []).filter(function (p) { return p.id === tgCtx.planId; })[0];
        var tg = [].concat(
            plan ? (plan.thread_groups || []) : [],
            model.setup_thread_groups || [],
            model.post_thread_groups || []
        ).filter(function (t) { return t && t.id === tgCtx.tgId; })[0];
        return { planId: tgCtx.planId, tgId: tgCtx.tgId, tg: tg, tgName: tgCtx.tgName };
    }

    function getSelectedStepId() {
        var node = global.document.querySelector(
            '.jms-tree-node.is-selected[data-step-id], .jms-if-card.is-selected[data-step-id], ' +
            '.jms-random-card.is-selected[data-step-id], .jms-simple-card.is-selected[data-step-id], ' +
            '.jms-transaction-card.is-selected[data-step-id], .jms-loop-card.is-selected[data-step-id], ' +
            '.jms-catalog-card.is-selected[data-step-id], .jms-http-card.is-selected[data-step-id]'
        );
        return node ? (node.getAttribute('data-step-id') || '') : '';
    }

    function resolve(vb) {
        var base = {
            context: 'thread_group',
            label: '线程组',
            planId: null,
            tgId: null,
            parentStepId: null,
            selectedStep: null
        };
        var active = getActiveTg(vb);
        if (!active) {
            base.context = 'test_plan';
            base.label = '测试计划';
            return base;
        }
        base.planId = active.planId;
        base.tgId = active.tgId;
        var stepId = getSelectedStepId();
        if (!stepId || !active.tg) return base;
        var step = findStepInList(active.tg.steps, stepId);
        if (!step) return base;
        base.selectedStep = step;
        if (isContainer(step)) {
            base.context = 'controller';
            base.parentStepId = step.id;
            base.label = step.name || '逻辑控制器';
            return base;
        }
        if (isSamplerStep(step)) {
            base.context = 'sampler_child';
            base.parentStepId = step.id;
            base.label = step.name || '取样器';
            return base;
        }
        return base;
    }

    global.JmsInsertContextV2 = {
        resolve: resolve,
        isContainer: isContainer,
        isSamplerStep: isSamplerStep,
        findStepInList: findStepInList
    };
})(window);

/* ---- js/jms_catalog_alias_map.js ---- */
/**
 * JMeter catalog · alias → 现有 visual builder 能力映射（隔离模块）
 */
(function (global) {
    'use strict';

    /** @type {Record<string, {kind: string, auxType?: string, configType?: string}>} */
    var ALIAS_MAP = {
        HTTPSamplerProxy: { kind: 'http' },
        HTTPSampler: { kind: 'http' },
        HTTPSampler2: { kind: 'http' },
        IfController: { kind: 'aux', auxType: 'if_controller' },
        RandomController: { kind: 'aux', auxType: 'random_controller' },
        GenericController: { kind: 'aux', auxType: 'simple_controller' },
        SimpleController: { kind: 'aux', auxType: 'simple_controller' },
        TransactionController: { kind: 'aux', auxType: 'transaction_controller' },
        LoopController: { kind: 'aux', auxType: 'loop_controller' },
        DebugSampler: { kind: 'aux', auxType: 'debug_sampler' },
        BeanShellPostProcessor: { kind: 'aux', auxType: 'beanshell_post' },
        JSONPostProcessor: { kind: 'aux', auxType: 'json_post' },
        RegexExtractor: { kind: 'aux', auxType: 'regex_extract' },
        XPathExtractor: { kind: 'aux', auxType: 'xpath_extract' },
        JSR223PostProcessor: { kind: 'aux', auxType: 'jsr223_post' },
        JDBCPostProcessor: { kind: 'aux', auxType: 'jdbc_post' },
        ConfigTestElement: { kind: 'config', configType: 'http_defaults' },
        HeaderManager: { kind: 'config', configType: 'header_manager' },
        AuthManager: { kind: 'config', configType: 'auth_manager' },
        CookieManager: { kind: 'config', configType: 'cookie_manager' },
        CacheManager: { kind: 'config', configType: 'cache_manager' },
        CSVDataSet: { kind: 'config', configType: 'csv_data_set' },
        CounterConfig: { kind: 'config', configType: 'counter' }
    };

    function resolve(alias) {
        return ALIAS_MAP[alias] || null;
    }

    global.JmsCatalogAliasMap = {
        resolve: resolve,
        ALIAS_MAP: ALIAS_MAP
    };
})(window);

/* ---- js/jms_catalog_jmx_prepare.js ---- */
/**
 * catalog JMX 导出前整形（隔离模块，仅导出链路使用，不改页面存储）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function prepareStepForExport(step) {
        if (!step || step.type !== 'catalog_element') return step;
        var out = clone(step);
        var NP = global.JmsCatalogJmxPropsNormalizeV1;
        if (NP && typeof NP.normalizeCatalogPropsForExport === 'function') {
            out = NP.normalizeCatalogPropsForExport(out);
        }
        var HP = global.JmsCatalogHttpSamplerPrepareV1;
        var skipHttpMigrate = HP && typeof HP.shouldSkipMountMigrateForHttp === 'function' && HP.shouldSkipMountMigrateForHttp(out);
        var PM = global.JmsCatalogPropsMountMigrateV1;
        if (!skipHttpMigrate && PM && typeof PM.migrateCatalogPropsMounts === 'function') {
            PM.migrateCatalogPropsMounts(out);
        }
        var MB = global.JmsMountCatalogBridge;
        if (MB && typeof MB.migrateLegacyMountArraysToHash === 'function' && MB.isMountHostStep && MB.isMountHostStep(out)) {
            MB.migrateLegacyMountArraysToHash(out);
        }
        return out;
    }

    function flattenHttpCatalogStep(step) {
        var HP = global.JmsCatalogHttpSamplerPrepareV1;
        if (HP && typeof HP.flattenHttpStepForJmxExport === 'function') {
            return HP.flattenHttpStepForJmxExport(step);
        }
        var props = (step && step.catalog_props) || {};
        var flat = clone(props) || {};
        flat.name = (step && step.name) || flat.name || 'HTTP 请求';
        flat.enabled = step && step.enabled !== false;
        return flat;
    }

    function legacyItemFromCatalog(step) {
        var props = (step && step.catalog_props) || {};
        var item = clone(props) || {};
        item.name = (step && step.name) || item.name || (step && step.label_zh) || '';
        item.enabled = step && step.enabled !== false;
        if (step && step.comments && !item.comments) item.comments = step.comments;
        return item;
    }

    function prepareScenarioForJmx(data) {
        if (!data || typeof data !== 'object') return data;
        var out = clone(data);
        function prepTg(tg) {
            if (!tg) return;
            walkSteps(tg.steps, prepareStepForExport);
        }
        (out.setup_thread_groups || []).forEach(prepTg);
        (out.post_thread_groups || []).forEach(prepTg);
        (out.thread_groups || []).forEach(prepTg);
        var VC = global.JmsJmxVariableCollectV1;
        if (VC && typeof VC.mergeMissingPlanVariables === 'function') {
            out = VC.mergeMissingPlanVariables(out);
        }
        return out;
    }

    global.JmsCatalogJmxPrepare = {
        prepareStepForExport: prepareStepForExport,
        flattenHttpCatalogStep: flattenHttpCatalogStep,
        legacyItemFromCatalog: legacyItemFromCatalog,
        prepareScenarioForJmx: prepareScenarioForJmx
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_jmx_prepare_export_v1.js ---- */
/**
 * catalog JMX 导出前整形编排（隔离模块，仅导出链路，不改 jms_catalog_jmx_prepare.js）
 */
(function (global) {
    'use strict';

    function prepareScenarioForJmxExport(data) {
        if (!data || typeof data !== 'object') return data;
        var out = data;
        var P = global.JmsCatalogJmxPrepare;
        if (P && typeof P.prepareScenarioForJmx === 'function') {
            out = P.prepareScenarioForJmx(out);
        }
        var VCE = global.JmsJmxVariableCollectExportV1;
        if (VCE && typeof VCE.mergeMissingPlanVariablesForExport === 'function') {
            out = VCE.mergeMissingPlanVariablesForExport(out);
        }
        var PD3 = global.JmsJmxPlanVariablesDedupeV3;
        if (PD3 && typeof PD3.filterPlanCatalogArguments === 'function') {
            out = PD3.filterPlanCatalogArguments(out);
        }
        var PD = global.JmsJmxPlanVariablesDedupeV2;
        if (PD && typeof PD.filterPlanCatalogItemsForExport === 'function') {
            out = PD.filterPlanCatalogItemsForExport(out);
        }
        var HD2 = global.JmsCatalogHttpDefaultsDedupeV2;
        if (HD2 && typeof HD2.dedupeScenarioHttpDefaultsV2 === 'function') {
            out = HD2.dedupeScenarioHttpDefaultsV2(out);
        } else {
            var HD = global.JmsCatalogHttpDefaultsDedupeV1;
            if (HD && typeof HD.dedupeScenarioHttpDefaults === 'function') {
                out = HD.dedupeScenarioHttpDefaults(out);
            }
        }
        return out;
    }

    global.JmsCatalogJmxPrepareExportV1 = {
        prepareScenarioForJmxExport: prepareScenarioForJmxExport
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_export_validate_steps_v1.js ---- */
/**
 * JMX 导出校验 · catalog 树形步骤识别（隔离模块，不改既有 normalizeHttpStep）
 */
(function (global) {
    'use strict';

    function walkSteps(steps, fn) {
        (steps || []).forEach(function (s) {
            if (!s) return;
            if (fn(s)) return true;
            if (s.container && Array.isArray(s.children) && walkSteps(s.children, fn)) return true;
            if (Array.isArray(s.catalog_hash_children) && walkSteps(s.catalog_hash_children, fn)) return true;
        });
        return false;
    }

    function shouldUseTreeNormalize(steps) {
        if (!Array.isArray(steps) || !steps.length) return false;
        if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.stepsNeedTreeXml === 'function') {
            if (global.JmxScenarioAdvanced.stepsNeedTreeXml(steps)) return true;
        }
        return walkSteps(steps, function (s) {
            if (s.type === 'catalog_element') return true;
            if (s.container) return true;
            if (s.type === 'if_controller' || s.type === 'debug_sampler' || s.type === 'beanshell_post') return true;
            if (Array.isArray(s.children) && s.children.length) return true;
            return false;
        });
    }

    global.JmsExportValidateStepsV1 = {
        shouldUseTreeNormalize: shouldUseTreeNormalize
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_props_mount_migrate_v1.js ---- */
/**
 * catalog_props 内嵌挂载区 → catalog_hash_children 迁移（仅导出链路，隔离模块）
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
        beanshell_pre: { alias: 'BeanShellPreProcessor', testclass: 'BeanShellPreProcessor', guiclass: 'TestBeanGUI', category: 'preprocessor', label_zh: 'BeanShell 前置处理器' },
        jsr223_pre: { alias: 'JSR223PreProcessor', testclass: 'JSR223PreProcessor', guiclass: 'TestBeanGUI', category: 'preprocessor', label_zh: 'JSR223 前置处理器' }
    };

    var ASSERT_MAP = {
        response: 'ResponseAssertion',
        response_assert: 'ResponseAssertion',
        json: 'JSONPathAssertion',
        json_assert: 'JSONPathAssertion',
        size: 'SizeAssertion',
        size_assert: 'SizeAssertion',
        md5hex: 'MD5HexAssertion',
        md5hex_assert: 'MD5HexAssertion',
        jsr223_assert: 'JSR223Assertion',
        jsr223: 'JSR223Assertion'
    };

    var ASSERT_META = {
        ResponseAssertion: { alias: 'ResponseAssertion', testclass: 'ResponseAssertion', guiclass: 'AssertionGui', category: 'assertion', label_zh: '响应断言' },
        JSONPathAssertion: { alias: 'JSONPathAssertion', testclass: 'JSONPathAssertion', guiclass: 'JSONPathAssertionGui', category: 'assertion', label_zh: 'JSON 断言' },
        SizeAssertion: { alias: 'SizeAssertion', testclass: 'SizeAssertion', guiclass: 'SizeAssertionGui', category: 'assertion', label_zh: '大小断言' },
        MD5HexAssertion: { alias: 'MD5HexAssertion', testclass: 'MD5HexAssertion', guiclass: 'MD5HexAssertionGui', category: 'assertion', label_zh: 'MD5Hex 断言' },
        JSR223Assertion: { alias: 'JSR223Assertion', testclass: 'JSR223Assertion', guiclass: 'TestBeanGUI', category: 'assertion', label_zh: 'JSR223 断言' }
    };

    var CONFIG_MAP = {
        http_defaults: { alias: 'ConfigTestElement', testclass: 'ConfigTestElement', guiclass: 'HttpDefaultsGui', category: 'config', label_zh: 'HTTP 请求默认值' },
        header_manager: { alias: 'HeaderManager', testclass: 'HeaderManager', guiclass: 'HeaderPanel', category: 'config', label_zh: 'HTTP 信息头管理器' },
        auth_manager: { alias: 'AuthManager', testclass: 'AuthManager', guiclass: 'AuthPanel', category: 'config', label_zh: 'HTTP 授权管理器' },
        cookie_manager: { alias: 'CookieManager', testclass: 'CookieManager', guiclass: 'CookiePanel', category: 'config', label_zh: 'HTTP Cookie 管理器' },
        cache_manager: { alias: 'CacheManager', testclass: 'CacheManager', guiclass: 'CachePanel', category: 'config', label_zh: 'HTTP 缓存管理器' },
        csv_data_set: { alias: 'CSVDataSet', testclass: 'CSVDataSet', guiclass: 'TestBeanGUI', category: 'config', label_zh: 'CSV 数据文件设置' },
        counter: { alias: 'CounterConfig', testclass: 'CounterConfig', guiclass: 'CounterConfigGui', category: 'config', label_zh: '计数器' }
    };

    function uid() {
        return 'cat_' + Math.random().toString(36).slice(2, 10);
    }

    function buildCat(map, name, props, enabled) {
        return {
            id: uid(),
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

    function asArray(v) {
        if (!v) return [];
        return Array.isArray(v) ? v : [];
    }

    var HTTP_MGR_KEYS = [
        "http_defaults", "header_manager", "cookie_manager", "cache_manager",
        "csv_data_set", "counter", "auth_manager"
    ];

    function httpManagersAsList(httpMgr) {
        if (!httpMgr) return [];
        if (Array.isArray(httpMgr)) return httpMgr;
        if (typeof httpMgr !== "object") return [];
        var list = [];
        var selected = httpMgr.selected_types;
        if (Array.isArray(selected)) {
            selected.forEach(function (t) {
                var data = httpMgr[t];
                if (data && typeof data === "object" && data.enabled !== false) {
                    list.push(Object.assign({ type: t }, data));
                }
            });
            return list;
        }
        HTTP_MGR_KEYS.forEach(function (t) {
            var data = httpMgr[t];
            if (data && typeof data === "object" && data.enabled) {
                list.push(Object.assign({ type: t }, data));
            }
        });
        return list;
    }

    function ensureHash(step) {
        if (!step.catalog_hash_children) step.catalog_hash_children = [];
        return step.catalog_hash_children;
    }

    function hasAlias(list, alias) {
        return (list || []).some(function (s) { return s && s.alias === alias; });
    }

    function pushProc(list, raw, mapTable) {
        if (!raw || !raw.type) return;
        var map = mapTable[raw.type];
        if (!map) return;
        var props = Object.assign({}, raw);
        delete props.type;
        list.push(buildCat(map, raw.name || map.label_zh, props, raw.enabled !== false));
    }

    function pushAssert(list, raw) {
        if (!raw || !raw.type) return;
        var alias = ASSERT_MAP[raw.type];
        if (!alias) return;
        var meta = ASSERT_META[alias];
        var props = Object.assign({}, raw);
        list.push(buildCat(meta, raw.name || meta.label_zh, props, raw.enabled !== false));
    }

    function pushConfig(list, raw) {
        if (!raw || !raw.type) return;
        var map = CONFIG_MAP[raw.type];
        if (!map) return;
        var props = Object.assign({}, raw.data || raw);
        delete props.type;
        delete props.id;
        list.push(buildCat(map, raw.name || map.label_zh, props, raw.enabled !== false));
    }

    function migrateCatalogPropsMounts(step) {
        if (!step || step.type !== 'catalog_element') return false;
        var props = step.catalog_props;
        if (!props || typeof props !== 'object') return false;
        var list = ensureHash(step);
        var changed = false;

        if (props.constant_timer && props.constant_timer.enabled !== false && !hasAlias(list, 'ConstantTimer')) {
            var t = props.constant_timer;
            list.push(buildCat(
                { alias: 'ConstantTimer', testclass: 'ConstantTimer', guiclass: 'ConstantTimerGui', category: 'timer', label_zh: '固定定时器' },
                t.name || '固定定时器',
                { delay_ms: t.delay_ms != null ? t.delay_ms : 300, comments: t.comments || '' },
                t.enabled !== false
            ));
            changed = true;
        }

        if (props.user_parameters && props.user_parameters.enabled !== false && !hasAlias(list, 'UserParameters')) {
            var up = props.user_parameters;
            list.push(buildCat(
                { alias: 'UserParameters', testclass: 'UserParameters', guiclass: 'UserParametersGui', category: 'preprocessor', label_zh: '用户参数' },
                up.name || '用户参数',
                { per_iteration: !!up.per_iteration, params: up.params || [] },
                up.enabled !== false
            ));
            changed = true;
        }

        asArray(props.pre_processors).forEach(function (p) {
            var before = list.length;
            pushProc(list, p, PRE_MAP);
            if (list.length > before) changed = true;
        });
        asArray(props.processors).forEach(function (p) {
            var before = list.length;
            pushProc(list, p, PROC_MAP);
            if (list.length > before) changed = true;
        });
        asArray(props.assertions).forEach(function (a) {
            var before = list.length;
            pushAssert(list, a);
            if (list.length > before) changed = true;
        });
        httpManagersAsList(props.http_managers).forEach(function (c) {
            var before = list.length;
            pushConfig(list, c);
            if (list.length > before) changed = true;
        });

        if (changed) {
            delete props.constant_timer;
            delete props.user_parameters;
            delete props.pre_processors;
            delete props.processors;
            delete props.assertions;
            delete props.http_managers;
        }
        return changed;
    }

    global.JmsCatalogPropsMountMigrateV1 = {
        migrateCatalogPropsMounts: migrateCatalogPropsMounts
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_jmx_props_normalize_v1.js ---- */
/**
 * catalog_props 导出前字段规范化（隔离模块，仅导出链路）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function headersToRows(headers) {
        if (!headers) return [];
        if (Array.isArray(headers)) return headers.slice();
        if (typeof headers !== 'object') return [];
        return Object.keys(headers).map(function (k) {
            return { name: k, value: headers[k] };
        });
    }

    function normalizeHeadersProps(props) {
        if (!props || typeof props !== 'object') return props;
        if (props.headers && !Array.isArray(props.headers)) {
            props.headers = headersToRows(props.headers);
        }
        return props;
    }

    function normalizeCsvProps(props, step) {
        if (!props || typeof props !== 'object') return props;
        var alias = (step && (step.alias || step.testclass)) || '';
        if (alias !== 'CSVDataSet') return props;
        if (props.enabled === undefined && step && step.enabled !== false) {
            props.enabled = true;
        }
        var filename = props.filename ? String(props.filename).trim() : '';
        if (!filename && props.file_content) {
            props.filename = 'data/data.csv';
        }
        if (!props.variable_names && props.variableNames) {
            props.variable_names = props.variableNames;
        }
        if (!props.file_encoding && props.fileEncoding) {
            props.file_encoding = props.fileEncoding;
        }
        return props;
    }

    function synthesizeAssertStatus(props) {
        if (!props || props.assert_status == null || props.assert_status === '') return props;
        var list = Array.isArray(props.assertions) ? props.assertions.slice() : [];
        var hasStatus = list.some(function (a) {
            return a && (a.type === 'response_assert' || a.type === 'response') &&
                (a.test_field === 'response_code' || !a.test_field);
        });
        if (!hasStatus) {
            list.unshift({
                type: 'response_assert',
                name: '响应状态码',
                enabled: true,
                test_field: 'response_code',
                match_mode: 'equals',
                patterns: [String(props.assert_status)]
            });
        }
        props.assertions = list;
        return props;
    }


    function normalizeJdbcProps(props, step) {
        if (!props || typeof props !== 'object') return props;
        var alias = (step && (step.alias || step.testclass)) || '';
        if (alias !== 'JDBCPostProcessor') return props;
        if (!props.dataSource && props.data_source) props.dataSource = props.data_source;
        if (!props.variableNames && props.variable_names) props.variableNames = props.variable_names;
        if (!props.resultVariable && props.result_variable) props.resultVariable = props.result_variable;
        if (!props.queryTypes && props.query_types) props.queryTypes = props.query_types;
        if (!props.queryTypes && props.query_type) props.queryTypes = props.query_type;
        if (!props.queryArguments && props.query_arguments) props.queryArguments = props.query_arguments;
        return props;
    }

    function normalizeCatalogPropsForExport(step) {
        if (!step || step.type !== 'catalog_element') return step;
        var out = clone(step);
        if (!out.catalog_props || typeof out.catalog_props !== 'object') {
            out.catalog_props = {};
        }
        normalizeHeadersProps(out.catalog_props);
        normalizeCsvProps(out.catalog_props, out);
        normalizeJdbcProps(out.catalog_props, out);
        if (out.alias === 'HTTPSamplerProxy' || out.testclass === 'HTTPSamplerProxy') {
            synthesizeAssertStatus(out.catalog_props);
        }
        return out;
    }

    global.JmsCatalogJmxPropsNormalizeV1 = {
        headersToRows: headersToRows,
        normalizeHeadersProps: normalizeHeadersProps,
        normalizeCsvProps: normalizeCsvProps,
        normalizeCatalogPropsForExport: normalizeCatalogPropsForExport
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_variable_collect_v1.js ---- */
/**
 * JMX 导出前变量引用扫描与缺失变量补齐（隔离模块）
 */
(function (global) {
    'use strict';

    var VAR_SEEDS = {
        GLOBAL_CHANNEL: 'web',
        ORDER_BUILD: '1.0.0',
        BUILD_ID: 'local-build',
        TG_ROLE: 'buyer'
    };

    var VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
    var SKIP_PREFIX = '__';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function collectRefsFromValue(val, refs) {
        if (val == null) return;
        if (typeof val === 'string') {
            VAR_RE.lastIndex = 0;
            var m;
            while ((m = VAR_RE.exec(val)) !== null) {
                if (m[1] && m[1].indexOf(SKIP_PREFIX) !== 0) refs[m[1]] = true;
            }
            return;
        }
        if (Array.isArray(val)) {
            val.forEach(function (v) { collectRefsFromValue(v, refs); });
            return;
        }
        if (typeof val === 'object') {
            Object.keys(val).forEach(function (k) { collectRefsFromValue(val[k], refs); });
        }
    }

    function walkSteps(steps, fn) {
        (steps || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function collectDefinedVars(data, defined) {
        defined = defined || {};
        Object.keys(data.variables || {}).forEach(function (k) { defined[k] = true; });
        if (data.base_url) defined.BASE_URL = true;
        ['setup_thread_groups', 'thread_groups', 'post_thread_groups'].forEach(function (key) {
            (data[key] || []).forEach(function (tg) {
                Object.keys(tg.variables || {}).forEach(function (k) { defined[k] = true; });
                walkSteps(tg.steps, function (s) {
                    var props = s.catalog_props || {};
                    if (s.alias === 'CounterConfig' && props.variable_name) {
                        defined[String(props.variable_name).trim()] = true;
                    }
                    if (s.alias === 'CSVDataSet' && props.variable_names) {
                        String(props.variable_names).split(',').forEach(function (v) {
                            v = v.trim();
                            if (v) defined[v] = true;
                        });
                    }
                    if (props.extract && props.extract.var) defined[props.extract.var] = true;
                    (props.extractors || []).forEach(function (ex) {
                        if (ex && ex.var) defined[ex.var] = true;
                    });
                    (props.user_parameters && props.user_parameters.params || []).forEach(function (p) {
                        if (p && p.name) defined[p.name] = true;
                    });
                });
            });
        });
        return defined;
    }

    function collectReferencedVars(data) {
        var refs = {};
        collectRefsFromValue(data, refs);
        return refs;
    }

    function mergeMissingPlanVariables(data) {
        if (!data || typeof data !== 'object') return data;
        var out = clone(data);
        out.variables = (out.variables && typeof out.variables === 'object') ? out.variables : {};
        if (!out.variables.BASE_URL && out.base_url) {
            out.variables.BASE_URL = String(out.base_url).replace(/\/$/, '');
        }
        if (out.build && !out.variables.BUILD_ID) {
            var bv = String(out.build);
            out.variables.BUILD_ID = (bv.indexOf('${') >= 0) ? (VAR_SEEDS.BUILD_ID || 'local-build') : bv;
        }
        var defined = collectDefinedVars(out, {});
        var refs = collectReferencedVars(out);
        Object.keys(refs).forEach(function (name) {
            if (defined[name] || out.variables[name] !== undefined) return;
            out.variables[name] = VAR_SEEDS[name] != null ? String(VAR_SEEDS[name]) : '';
        });
        return out;
    }

    global.JmsJmxVariableCollectV1 = {
        VAR_SEEDS: VAR_SEEDS,
        mergeMissingPlanVariables: mergeMissingPlanVariables,
        collectReferencedVars: collectReferencedVars,
        collectDefinedVars: collectDefinedVars
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_variable_collect_export_v1.js ---- */
/**
 * JMX 导出专用 · 计划变量补齐（保留 ${BUILD_ID} 等引用形式，隔离模块）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function mergeMissingPlanVariablesForExport(data) {
        var VC = global.JmsJmxVariableCollectV1;
        if (!VC || typeof VC.mergeMissingPlanVariables !== 'function') return data;
        var out = VC.mergeMissingPlanVariables(clone(data));
        if (!out || typeof out !== 'object') return out;
        out.variables = out.variables || {};
        if (data && data.build) {
            var bv = String(data.build);
            if (bv.indexOf('${') >= 0) {
                out.variables.BUILD_ID = bv.indexOf('BUILD_ID') >= 0 ? bv : '${BUILD_ID}';
            }
        }
        return out;
    }

    global.JmsJmxVariableCollectExportV1 = {
        mergeMissingPlanVariablesForExport: mergeMissingPlanVariablesForExport
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_http_sampler_prepare_v1.js ---- */
/**
 * catalog HTTP 取样器导出前整形（隔离模块，仅 catalog HTTP 导出链路）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function isHttpAlias(alias) {
        return alias === 'HTTPSamplerProxy' || alias === 'HTTPSampler' || alias === 'HTTPSampler2';
    }

    function rowsToHeadersObject(rows) {
        if (!rows) return {};
        if (!Array.isArray(rows)) return (typeof rows === 'object') ? clone(rows) : {};
        var o = {};
        rows.forEach(function (r) {
            if (!r) return;
            var k = r.name || r.key || '';
            if (k) o[k] = r.value != null ? String(r.value) : '';
        });
        return o;
    }

    function flattenHttpStepForJmxExport(step) {
        if (!step) return {};
        var props = step.catalog_props || {};
        var flat = clone(props) || {};
        flat.name = step.name || flat.name || 'HTTP 请求';
        flat.enabled = step.enabled !== false;
        if (Array.isArray(flat.headers)) {
            flat.headers = rowsToHeadersObject(flat.headers);
        }
        return flat;
    }

    function shouldSkipMountMigrateForHttp(step) {
        if (!step || step.type !== 'catalog_element') return false;
        return isHttpAlias(step.alias) || isHttpAlias(step.testclass);
    }

    global.JmsCatalogHttpSamplerPrepareV1 = {
        isHttpAlias: isHttpAlias,
        flattenHttpStepForJmxExport: flattenHttpStepForJmxExport,
        shouldSkipMountMigrateForHttp: shouldSkipMountMigrateForHttp,
        rowsToHeadersObject: rowsToHeadersObject
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_extract_export_v1.js ---- */
/**
 * catalog HTTP 提取器双通道导出（主 extract + extractors[]，隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        return String(s == null ? '' : s);
    }

    function genJsonExtractXml(ex, childPad, escapeXml) {
        if (!ex || !ex.var || !ex.json_path) return '';
        var xml = '';
        xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
            escapeXml(ex.var) + '" enabled="true">\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(ex.var) + '</stringProp>\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(ex.json_path) + '</stringProp>\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
        xml += childPad + '</JSONPostProcessor>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    function prepareFlatForGenSingleHttp(flat) {
        var out = flat;
        if (!out || typeof out !== 'object') return out;
        out.extractors = [];
        return out;
    }

    function injectExtractorsIntoSamplerXml(samplerXml, flat, indent, helpers) {
        if (!samplerXml || !flat) return samplerXml;
        var extractors = flat.extractors;
        if (!extractors || !extractors.length) return samplerXml;
        var escapeXml = function (s) { return esc(s, helpers); };
        var childPad = indent + '  ';
        var extra = '';
        extractors.forEach(function (ex) {
            extra += genJsonExtractXml(ex, childPad, escapeXml);
        });
        if (!extra) return samplerXml;
        var close = indent + '</hashTree>\n';
        var idx = samplerXml.lastIndexOf(close);
        if (idx >= 0) {
            return samplerXml.slice(0, idx) + extra + samplerXml.slice(idx);
        }
        var emptyTag = indent + '<hashTree/>\n';
        if (samplerXml.indexOf(emptyTag) >= 0) {
            return samplerXml.replace(emptyTag, indent + '<hashTree>\n' + extra + close);
        }
        return samplerXml + extra;
    }

    global.JmsCatalogExtractExportV1 = {
        genJsonExtractXml: genJsonExtractXml,
        prepareFlatForGenSingleHttp: prepareFlatForGenSingleHttp,
        injectExtractorsIntoSamplerXml: injectExtractorsIntoSamplerXml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_sampler_children_order_v1.js ---- */
/**
 * catalog hashTree 子节点有序写出（隔离模块，替代无序 injectHashChildren）
 */
(function (global) {
    'use strict';

    var ORDER = [
        'BeanShellPreProcessor', 'JSR223PreProcessor', 'UserParameters',
        'HeaderManager', 'ConfigTestElement', 'AuthManager', 'CookieManager', 'CacheManager',
        'JSONPostProcessor', 'RegexExtractor', 'XPathExtractor',
        'JSR223PostProcessor', 'BeanShellPostProcessor', 'JDBCPostProcessor',
        'ResponseAssertion', 'JSONPathAssertion', 'SizeAssertion', 'MD5HexAssertion', 'JSR223Assertion',
        'ConstantTimer', 'DebugSampler', 'ViewResultsFullVisualizer', 'StatVisualizer', 'ResultCollector'
    ];

    function orderIndex(alias) {
        var i = ORDER.indexOf(alias);
        return i >= 0 ? i : 999;
    }

    function sortHashChildren(list) {
        return (list || []).slice().sort(function (a, b) {
            return orderIndex(a && a.alias) - orderIndex(b && b.alias);
        });
    }

    function injectOrderedHashChildren(xml, indent, hashChildren, helpers) {
        if (!hashChildren || !hashChildren.length) return xml;
        var sorted = sortHashChildren(hashChildren);
        var M = global.JmsCatalogMountJmx;
        if (!M || typeof M.genMountItemsXml !== 'function') return xml;
        var mountXml = M.genMountItemsXml(sorted, indent + '  ', helpers);
        if (!mountXml) return xml;
        var emptyTag = indent + '<hashTree/>\n';
        if (xml.indexOf(emptyTag) >= 0) {
            return xml.replace(emptyTag, indent + '<hashTree>\n' + mountXml + indent + '</hashTree>\n');
        }
        var close = indent + '</hashTree>\n';
        var idx = xml.lastIndexOf(close);
        if (idx >= 0) {
            return xml.slice(0, idx) + mountXml + xml.slice(idx);
        }
        return xml + mountXml;
    }

    global.JmsCatalogSamplerChildrenOrderV1 = {
        ORDER: ORDER,
        sortHashChildren: sortHashChildren,
        injectOrderedHashChildren: injectOrderedHashChildren
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_script_sanitize_v1.js ---- */
/**
 * JMX 导出前 · 脚本字段清洗（去除 YAML 尾部 "\ " 污染）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function sanitizeScriptText(s) {
        if (s == null) return '';
        var t = String(s);
        t = t.replace(/\s+\\\s*$/g, '');
        t = t.replace(/\\[\s]*$/g, '');
        return t;
    }

    function walk(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
        }
        Object.keys(obj).forEach(function (k) {
            if ((k === 'script' || k === 'query' || k === 'initScript') && typeof obj[k] === 'string') {
                obj[k] = sanitizeScriptText(obj[k]);
            } else if (obj[k] && typeof obj[k] === 'object') {
                walk(obj[k]);
            }
        });
    }

    function sanitizeScenario(data) {
        if (!data || typeof data !== 'object') return data;
        var out = clone(data);
        walk(out);
        return out;
    }

    global.JmsJmxScriptSanitizeV1 = {
        sanitizeScriptText: sanitizeScriptText,
        sanitizeScenario: sanitizeScenario
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_arguments_dedupe_v1.js ---- */
/**
 * JMX 导出 · 计划级 Arguments 去重（TestPlan 内嵌变量 vs 独立 Arguments 组件）
 */
(function (global) {
    'use strict';

    function hasVariableEntries(variables) {
        return !!(variables && typeof variables === 'object' && Object.keys(variables).length);
    }

    function shouldSkipPublicVariablesComponent(data) {
        if (!data) return false;
        if (!hasVariableEntries(data.variables)) return false;
        var R = global.JmsPlanCatalogResolve;
        if (R && typeof R.shouldSkipLegacyPlanHashExports === 'function' &&
            R.shouldSkipLegacyPlanHashExports(data)) {
            return true;
        }
        return true;
    }

    global.JmsJmxArgumentsDedupeV1 = {
        shouldSkipPublicVariablesComponent: shouldSkipPublicVariablesComponent
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_plan_variables_dedupe_v2.js ---- */
/**
 * JMX 导出 · 计划变量去重 V2（跳过 plan_catalog Arguments 重复写出，隔离模块）
 */
(function (global) {
    'use strict';

    function hasPlanVariables(data) {
        return !!(data && data.variables && typeof data.variables === 'object' && Object.keys(data.variables).length);
    }

    function filterPlanCatalogItemsForExport(data) {
        if (!data || !hasPlanVariables(data)) return data;
        if (!Array.isArray(data.plan_catalog_items)) return data;
        data.plan_catalog_items = data.plan_catalog_items.filter(function (item) {
            if (!item || item.enabled === false) return true;
            if (item.alias === 'Arguments' || item.testclass === 'Arguments') return false;
            return true;
        });
        return data;
    }

    global.JmsJmxPlanVariablesDedupeV2 = {
        hasPlanVariables: hasPlanVariables,
        filterPlanCatalogItemsForExport: filterPlanCatalogItemsForExport
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmeter_jmx_extra_export_v2.js ---- */
/**
 * JMX 导出 V2 · HTTP 取样器子组件单通道写出（跳过重复 genStepConfigXml）
 */
(function (global) {
    'use strict';

    function genStepChildComponentsXml(st, childPad, escapeXml) {
        var xml = '';
        var E = global.JmeterJmxExtra;
        if (!E) return xml;

        if (global.JmsHttpStepListenerJmx && typeof global.JmsHttpStepListenerJmx.genStepListenersXml === 'function') {
            xml += global.JmsHttpStepListenerJmx.genStepListenersXml(st, childPad, escapeXml);
        }
        var sl = st.step_listeners || {};
        var hasItems = global.JmsHttpStepListenerCatalog &&
            Array.isArray(st.step_listener_items) &&
            st.step_listener_items.length;
        if (!hasItems) {
            if (sl.view_results_tree && typeof E.genViewResultsTreeXml === 'function') {
                xml += E.genViewResultsTreeXml(childPad, escapeXml, { name: '查看结果树 ' + (st.name || '') });
            }
            if (sl.aggregate_report && typeof E.genAggregateReportXml === 'function') {
                xml += E.genAggregateReportXml(childPad, escapeXml, { name: '聚合报告 ' + (st.name || '') });
            }
        }
        if (st.constant_timer && typeof E.genConstantTimerXml === 'function') {
            xml += E.genConstantTimerXml(st.constant_timer, childPad, escapeXml);
        }
        if (Array.isArray(st.pre_processors) && global.JmsHttpBeanshellPreProcessorJmx &&
            typeof global.JmsHttpBeanshellPreProcessorJmx.genXml === 'function') {
            st.pre_processors.forEach(function (p) {
                if (p && p.type === 'beanshell_pre') {
                    xml += global.JmsHttpBeanshellPreProcessorJmx.genXml(p, childPad, escapeXml);
                }
            });
        }
        if (st.user_parameters && typeof E.genUserParametersXml === 'function') {
            var UP = global.JmsCatalogUserParametersExportV1;
            if (UP && typeof UP.genUserParametersXml === 'function') {
                xml += UP.genUserParametersXml(st.user_parameters, childPad, escapeXml);
            } else {
                xml += E.genUserParametersXml(st.user_parameters, childPad, escapeXml);
            }
        }
        return xml;
    }

    global.JmeterJmxExtraExportV2 = {
        genStepChildComponentsXml: genStepChildComponentsXml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_user_parameters_export_v1.js ---- */
/**
 * catalog/HTTP · UserParameters 导出增强（value → values[] 兼容）
 */
(function (global) {
    'use strict';

    function normalizeForExport(cfg) {
        cfg = cfg && typeof cfg === 'object' ? cfg : {};
        var Catalog = global.JmsHttpStepUserParamsCatalog;
        if (Catalog && typeof Catalog.normalizeParams === 'function') {
            return Catalog.normalizeParams(cfg);
        }
        var raw = Array.isArray(cfg.params) ? cfg.params : [];
        var params = raw.map(function (p) {
            if (!p || typeof p !== 'object') return null;
            var key = String(p.key || p.name || '').trim();
            if (!key) return null;
            var values = [];
            if (Array.isArray(p.values)) {
                p.values.forEach(function (v) { values.push(v == null ? '' : String(v)); });
            } else if (p.value !== undefined) {
                values.push(String(p.value));
            } else {
                values.push('');
            }
            return { key: key, values: values };
        }).filter(Boolean);
        return {
            enabled: !!cfg.enabled,
            name: cfg.name ? String(cfg.name) : '用户参数',
            comments: cfg.comments != null ? String(cfg.comments) : '',
            per_iteration: !!cfg.per_iteration,
            params: params,
            user_count: Math.max(1, cfg.user_count || 1)
        };
    }

    function genUserParametersXml(cfg, indent, escapeXml) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genUserParametersXml !== 'function') return '';
        return E.genUserParametersXml(normalizeForExport(cfg), indent, escapeXml);
    }

    function legacyItem(step) {
        var P = global.JmsCatalogJmxPrepare;
        return P && typeof P.legacyItemFromCatalog === 'function' ? P.legacyItemFromCatalog(step) : (step.catalog_props || {});
    }

    function escapeFn(helpers) {
        var esc = helpers && helpers.escapeXml;
        return function (s) { return esc ? esc(s) : String(s == null ? '' : s); };
    }

    function genCatalogUserParametersXml(step, indent, helpers) {
        var item = legacyItem(step);
        return genUserParametersXml({
            enabled: step.enabled !== false,
            name: step.name || item.name || '用户参数',
            comments: item.comments || '',
            per_iteration: item.per_iteration,
            params: item.params || []
        }, indent, escapeFn(helpers));
    }

    function patchAuxUserParameters() {
        var A = global.JmsCatalogAuxJmx;
        if (!A || !A.MAP || A.__userParamsExportPatched) return;
        A.MAP.UserParameters = genCatalogUserParametersXml;
        A.__userParamsExportPatched = true;
    }

    function patchMountMigrate() {
        var M = global.JmsCatalogPropsMountMigrateV1;
        if (!M || M.__userParamsMigratePatched || typeof M.migrateCatalogPropsMounts !== 'function') return;
        var orig = M.migrateCatalogPropsMounts;
        M.migrateCatalogPropsMounts = function (step) {
            var props = step && step.catalog_props;
            if (props && props.user_parameters && Array.isArray(props.user_parameters.params)) {
                var norm = normalizeForExport(props.user_parameters);
                props.user_parameters = Object.assign({}, props.user_parameters, {
                    params: norm.params.map(function (p) {
                        return { key: p.key, value: p.values[0] || '', values: p.values.slice() };
                    })
                });
            }
            return orig.call(M, step);
        };
        M.__userParamsMigratePatched = true;
    }

    function init() {
        patchAuxUserParameters();
        patchMountMigrate();
    }

    global.JmsCatalogUserParametersExportV1 = {
        normalizeForExport: normalizeForExport,
        genUserParametersXml: genUserParametersXml,
        genCatalogUserParametersXml: genCatalogUserParametersXml,
        init: init
    };

    init();
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_xpath_export_alias_v1.js ---- */
/**
 * XPath 导出别名修复 · aux 调用 genXPathExtractorXml，模块仅导出 genXml
 */
(function (global) {
    'use strict';

    function patchXPathAliases() {
        var X = global.JmxXPathExtractor;
        if (!X) return;
        if (typeof X.genXml === 'function' && typeof X.genXPathExtractorXml !== 'function') {
            X.genXPathExtractorXml = X.genXml;
        }
        var J = global.JmxJsonPostProcessor;
        if (J && typeof J.genXml === 'function' && typeof J.genJsonPostProcessorXml !== 'function') {
            J.genJsonPostProcessorXml = J.genXml;
        }
        var R = global.JmxRegexExtractor;
        if (R && typeof R.genXml === 'function' && typeof R.genRegexExtractorXml !== 'function') {
            R.genRegexExtractorXml = R.genXml;
        }
    }

    function init() {
        patchXPathAliases();
    }

    global.JmsCatalogXpathExportAliasV1 = {
        patchXPathAliases: patchXPathAliases,
        init: init
    };

    init();
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_empty_config_suppress_v1.js ---- */
/**
 * JMX 导出 · 抑制空壳 ConfigTestElement / 无内容 HTTP 默认配置
 */
(function (global) {
    'use strict';

    var BOILERPLATE_KEYS = {
        implementation: ['HttpClient4', ''],
        follow_redirects: [true, false],
        auto_redirects: [true, false],
        use_keepalive: [true, false],
        content_encoding: ['', 'UTF-8'],
        connect_timeout: ['', '5000', '0'],
        response_timeout: ['', '12000', '0'],
        protocol: [''],
        domain: [''],
        port: [''],
        path: ['', '/']
    };

    function props(step) {
        return (step && step.catalog_props) || {};
    }

    function isBoilerplateValue(key, val) {
        var allowed = BOILERPLATE_KEYS[key];
        if (!allowed) return false;
        if (typeof val === 'boolean') return allowed.indexOf(val) >= 0;
        return allowed.indexOf(String(val)) >= 0;
    }

    function isEmptyConfigStep(step) {
        if (!step || step.type !== 'catalog_element') return false;
        if (step.alias !== 'ConfigTestElement') return false;
        var p = props(step);
        var keys = Object.keys(p).filter(function (k) {
            if (k === 'name' || k === 'enabled' || k === 'comments') return false;
            var v = p[k];
            if (v == null || v === '') return false;
            if (typeof v === 'object' && !Object.keys(v).length) return false;
            if (isBoilerplateValue(k, v)) return false;
            return true;
        });
        return keys.length === 0;
    }

    function patchRegistry() {
        var R = global.JmsCatalogJmxRegistry;
        if (!R || R.__emptyConfigPatched || typeof R.writeStep !== 'function') return;
        var orig = R.writeStep;
        R.writeStep = function (step, indent, helpers) {
            if (isEmptyConfigStep(step)) return '';
            return orig.call(R, step, indent, helpers);
        };
        R.__emptyConfigPatched = true;
    }

    function init() { patchRegistry(); }

    global.JmsCatalogEmptyConfigSuppressV1 = {
        isEmptyConfigStep: isEmptyConfigStep,
        patchRegistry: patchRegistry,
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

/* ---- js/jms_catalog_http_defaults_dedupe_v1.js ---- */
/**
 * JMX 导出 · 线程组内空壳/重复 HTTP 请求默认值去重（隔离模块）
 */
(function (global) {
    'use strict';

    function props(step) {
        return (step && step.catalog_props) || {};
    }

    function isEmptyHttpDefault(step) {
        var S = global.JmsCatalogEmptyConfigSuppressV1;
        if (S && typeof S.isEmptyConfigStep === 'function') return S.isEmptyConfigStep(step);
        if (!step || step.alias !== 'ConfigTestElement') return false;
        var p = props(step);
        return !(p.domain || p.port || p.protocol || p.connect_timeout || p.response_timeout);
    }

    function richness(step) {
        var p = props(step);
        var n = 0;
        ['domain', 'port', 'protocol', 'path', 'connect_timeout', 'response_timeout', 'content_encoding'].forEach(function (k) {
            if (p[k]) n += 1;
        });
        return n;
    }

    function dedupeStepsArray(steps) {
        if (!Array.isArray(steps) || !steps.length) return steps;
        var httpDefaults = [];
        steps.forEach(function (s, idx) {
            if (s && s.alias === 'ConfigTestElement') httpDefaults.push({ idx: idx, step: s });
        });
        if (httpDefaults.length <= 1) return steps;
        var best = httpDefaults.reduce(function (a, b) {
            return richness(b.step) > richness(a.step) ? b : a;
        });
        var removeIdx = {};
        httpDefaults.forEach(function (row) {
            if (row.idx === best.idx) return;
            if (isEmptyHttpDefault(row.step) || richness(row.step) < richness(best.step)) {
                removeIdx[row.idx] = true;
            }
        });
        if (!Object.keys(removeIdx).length) return steps;
        return steps.filter(function (_s, idx) { return !removeIdx[idx]; });
    }

    function dedupeThreadGroup(tg) {
        if (!tg || !Array.isArray(tg.steps)) return tg;
        tg.steps = dedupeStepsArray(tg.steps);
        return tg;
    }

    function dedupeScenarioHttpDefaults(data) {
        if (!data) return data;
        (data.setup_thread_groups || []).forEach(dedupeThreadGroup);
        (data.thread_groups || []).forEach(dedupeThreadGroup);
        (data.post_thread_groups || []).forEach(dedupeThreadGroup);
        return data;
    }

    global.JmsCatalogHttpDefaultsDedupeV1 = {
        dedupeScenarioHttpDefaults: dedupeScenarioHttpDefaults,
        dedupeStepsArray: dedupeStepsArray
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_assertion_export_include_disabled_v1.js ---- */
/**
 * JMX 导出 · 断言包含 disabled 状态写出（不修改各断言模块 genXml）
 */
(function (global) {
    'use strict';

    var TYPE_CLASS = {
        response_assert: 'ResponseAssertion',
        json_assert: 'JSONPathAssertion',
        size_assert: 'SizeAssertion',
        md5hex_assert: 'MD5HexAssertion',
        jsr223_assert: 'JSR223Assertion'
    };

    function delegateGen(assertion, samplerName, childPad, escapeXml) {
        if (!assertion || !assertion.type) return '';
        if (assertion.type === 'response_assert' &&
            global.JmsHttpResponseAssertionJmx && typeof global.JmsHttpResponseAssertionJmx.genXml === 'function') {
            return global.JmsHttpResponseAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'json_assert' &&
            global.JmsHttpJsonAssertionJmx && typeof global.JmsHttpJsonAssertionJmx.genXml === 'function') {
            return global.JmsHttpJsonAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'size_assert' &&
            global.JmsHttpSizeAssertionJmx && typeof global.JmsHttpSizeAssertionJmx.genXml === 'function') {
            return global.JmsHttpSizeAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'md5hex_assert' &&
            global.JmsHttpMd5hexAssertionJmx && typeof global.JmsHttpMd5hexAssertionJmx.genXml === 'function') {
            return global.JmsHttpMd5hexAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'jsr223_assert' &&
            global.JmxJsr223Assertion && typeof global.JmxJsr223Assertion.genXml === 'function') {
            return global.JmxJsr223Assertion.genXml(assertion, samplerName, childPad, escapeXml);
        }
        return null;
    }

    function fixDisabledEnabledAttr(xml, testclass) {
        if (!xml || !testclass) return xml;
        var re = new RegExp('(<[^>]*testclass="' + testclass + '"[^>]*)enabled="true"', 'i');
        return xml.replace(re, '$1enabled="false"');
    }

    function genAssertionXml(assertion, samplerName, childPad, escapeXml) {
        if (!assertion) return '';
        if (assertion.enabled === false) {
            var clone = Object.assign({}, assertion);
            clone.enabled = true;
            var xml = delegateGen(clone, samplerName, childPad, escapeXml);
            if (xml === null || xml === '') return xml || '';
            return fixDisabledEnabledAttr(xml, TYPE_CLASS[assertion.type] || '');
        }
        var routed = delegateGen(assertion, samplerName, childPad, escapeXml);
        return routed === null ? '' : routed;
    }

    global.JmsAssertionExportIncludeDisabledV1 = {
        genAssertionXml: genAssertionXml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_export_self_check_v1.js ---- */
/**
 * JMX 导出自检门禁 · 硬错误计数供 buildSummary 展示
 */
(function (global) {
    'use strict';

    function countTag(xml, tag) {
        if (!xml) return 0;
        var re = new RegExp('<' + tag + '[\\s>]', 'g');
        var m = xml.match(re);
        return m ? m.length : 0;
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function countScenarioXPath(steps) {
        var n = 0;
        walkSteps(steps, function (s) {
            if (s.type === 'catalog_element' && s.alias === 'XPathExtractor' && s.enabled !== false) n += 1;
        });
        return n;
    }

    function countMountJsr223(data) {
        var n = 0;
        function scanProps(props) {
            (props && props.processors || []).forEach(function (p) {
                if (p && p.type === 'jsr223_post' && p.enabled !== false) n += 1;
            });
        }
        function scanTg(tg) {
            walkSteps(tg && tg.steps, function (s) {
                if (!s || s.type !== 'catalog_element') return;
                scanProps(s.catalog_props || {});
                (s.catalog_hash_children || []).forEach(function (c) {
                    if (c && c.alias === 'JSR223PostProcessor' && c.enabled !== false) n += 1;
                });
            });
        }
        (data.setup_thread_groups || []).forEach(scanTg);
        (data.thread_groups || []).forEach(scanTg);
        (data.post_thread_groups || []).forEach(scanTg);
        return n;
    }

    function countCsvWithoutContent(data) {
        var n = 0;
        function maybeCount(props) {
            if (!props || props.enabled === false) return;
            var fn = props.filename ? String(props.filename).trim() : '';
            var content = props.file_content != null ? String(props.file_content).trim() : '';
            if (fn && !content) n += 1;
        }
        function scanTg(tg) {
            walkSteps(tg && tg.steps, function (s) {
                if (s && s.alias === 'CSVDataSet') maybeCount(s.catalog_props || {});
            });
        }
        (data.setup_thread_groups || []).forEach(scanTg);
        (data.thread_groups || []).forEach(scanTg);
        (data.post_thread_groups || []).forEach(scanTg);
        return n;
    }

    function collectAllSteps(data) {
        var all = [];
        function pullTg(tg) {
            if (!tg) return;
            all = all.concat(tg.steps || []);
        }
        (data.setup_thread_groups || []).forEach(pullTg);
        (data.thread_groups || []).forEach(pullTg);
        (data.post_thread_groups || []).forEach(pullTg);
        if (data.steps) all = all.concat(data.steps);
        return all;
    }

    function findDuplicateHeaderManagers(xml) {
        var names = {};
        var dups = [];
        var re = /<HeaderManager[^>]*testname="([^"]*)"/g;
        var m;
        while ((m = re.exec(xml)) !== null) {
            var nm = m[1];
            if (names[nm]) dups.push(nm);
            else names[nm] = 1;
        }
        return dups;
    }

    function hasEncodedJmeterVarsInPaths(xml) {
        return /HTTPSampler\.path[^<]*%24%7B/i.test(xml || '');
    }

    function countCookieMissingName(xml) {
        var n = 0;
        var re = /<elementProp[^>]*elementType="Cookie"[^>]*>([\s\S]*?)<\/elementProp>/g;
        var m;
        while ((m = re.exec(xml)) !== null) {
            if (m[1].indexOf('Cookie.name') < 0) n += 1;
        }
        return n;
    }

    function run(scenario, jmx) {
        var issues = [];
        var hard = 0;
        var warn = 0;
        scenario = scenario || {};
        if (!jmx) {
            issues.push({ level: 'hard', msg: 'JMX 为空' });
            hard += 1;
        } else {
            var dupHeaders = findDuplicateHeaderManagers(jmx);
            dupHeaders.forEach(function (nm) {
                issues.push({ level: 'hard', msg: 'HeaderManager 重复: ' + nm });
                hard += 1;
            });
            var xpExpected = countScenarioXPath(collectAllSteps(scenario));
            var xpActual = countTag(jmx, 'XPathExtractor');
            if (xpExpected > 0 && xpActual < xpExpected) {
                issues.push({ level: 'hard', msg: 'XPathExtractor 缺失: 期望 ' + xpExpected + ' 实际 ' + xpActual });
                hard += 1;
            }
            if (hasEncodedJmeterVarsInPaths(jmx)) {
                issues.push({ level: 'hard', msg: 'GET 路径 query 变量被 URL 编码（%24%7B），运行时无法展开' });
                hard += 1;
            }
            var jsrExpected = countMountJsr223(scenario);
            var jsrActual = countTag(jmx, 'JSR223PostProcessor');
            if (jsrExpected > 0 && jsrActual < jsrExpected) {
                issues.push({ level: 'hard', msg: '挂载区 JSR223 后置缺失: 期望 ' + jsrExpected + ' 实际 ' + jsrActual });
                hard += 1;
            }
            var cookieMissing = countCookieMissingName(jmx);
            if (cookieMissing > 0) {
                issues.push({ level: 'warn', msg: 'Cookie 节点缺少 Cookie.name: ' + cookieMissing + ' 处' });
                warn += 1;
            }
            var csvOrphan = countCsvWithoutContent(scenario);
            if (csvOrphan > 0) {
                issues.push({ level: 'warn', msg: 'CSV 仅路径无内联内容: ' + csvOrphan + ' 处，单独运行需自备 data/*.csv 或下载 ZIP 包' });
                warn += 1;
            }
            if (countTag(jmx, 'hashTree') > 0 && jmx.indexOf('</HTTPSamplerProxy>\n      <hashTree/>\n      <HeaderManager') >= 0) {
                issues.push({ level: 'warn', msg: '疑似 hashTree 与 HeaderManager 邻接错位' });
                warn += 1;
            }
            if (/<IfController|<LoopController|<TransactionController|<RandomController|<GenericController/.test(jmx) &&
                countTag(jmx, 'ResponseAssertion') > countTag(jmx, 'HTTPSamplerProxy')) {
                issues.push({ level: 'warn', msg: '控制器挂载区含断言/提取器，默认不作用于子采样器，请确认压测语义' });
                warn += 1;
            }
        }
        var result = { ok: hard === 0, hard: hard, warn: warn, issues: issues };
        global.__jmsJmxExportSelfCheckLast = result;
        return result;
    }

    global.JmsJmxExportSelfCheckV1 = {
        run: run,
        getLast: function () { return global.__jmsJmxExportSelfCheckLast || null; }
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_export_self_check_v2.js ---- */
/**
 * JMX 导出自检 V2 · 语义门禁 + 下载阻断（隔离模块，不修改 V1）
 */
(function (global) {
    'use strict';

    function runV2(scenario, jmx) {
        var base = null;
        if (global.JmsJmxExportSelfCheckV1 && typeof global.JmsJmxExportSelfCheckV1.run === 'function') {
            base = global.JmsJmxExportSelfCheckV1.run(scenario, jmx);
        } else {
            base = { ok: true, hard: 0, warn: 0, issues: [] };
        }
        var issues = (base.issues || []).slice();
        var hard = base.hard || 0;
        var warn = base.warn || 0;
        if (jmx) {
            var httpExpected = collectHttpSamplerNames(scenario);
            var httpActual = collectJmxSamplerNames(jmx);
            httpExpected.forEach(function (nm) {
                if (httpActual.indexOf(nm) < 0) {
                    issues.push({ level: 'hard', msg: 'HTTP 采样器缺失: ' + nm });
                    hard += 1;
                }
            });
            if (countPlanArgsDuplicate(jmx)) {
                issues.push({ level: 'warn', msg: '计划变量双份：TestPlan 内嵌变量与独立 Arguments 重复' });
                warn += 1;
            }
            var emptyDefaults = countEmptyHttpDefaults(jmx);
            if (emptyDefaults > 2) {
                issues.push({ level: 'warn', msg: '空壳 HTTP 请求默认值过多: ' + emptyDefaults + ' 处' });
                warn += 1;
            }
        }
        var result = { ok: hard === 0, hard: hard, warn: warn, issues: issues, blockDownload: hard > 0 };
        global.__jmsJmxExportSelfCheckV2Last = result;
        return result;
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function collectHttpSamplerNames(data) {
        var names = [];
        function scanTg(tg) {
            walkSteps(tg && tg.steps, function (s) {
                if (s && (s.alias === 'HTTPSamplerProxy' || s.type === 'http' || (s.catalog_props && s.catalog_props.method))) {
                    var nm = s.name || (s.catalog_props && s.catalog_props.name);
                    if (nm) names.push(String(nm));
                }
            });
        }
        (data.setup_thread_groups || []).forEach(scanTg);
        (data.thread_groups || []).forEach(scanTg);
        (data.post_thread_groups || []).forEach(scanTg);
        walkSteps(data.steps, function (s) {
            if (s && s.method) names.push(String(s.name || 'step'));
        });
        return names;
    }

    function collectJmxSamplerNames(xml) {
        var names = [];
        var re = /<HTTPSamplerProxy[^>]*testname="([^"]*)"/g;
        var m;
        while ((m = re.exec(xml)) !== null) names.push(m[1]);
        return names;
    }

    function countPlanArgsDuplicate(xml) {
        var hasEmbedded = xml.indexOf('TestPlan.user_defined_variables') >= 0;
        var hasStandalone = /<Arguments[^>]*testname="[^"]*计划变量/i.test(xml);
        return hasEmbedded && hasStandalone;
    }

    function countEmptyHttpDefaults(xml) {
        var n = 0;
        var re = /<ConfigTestElement[^>]*testname="HTTP 请求默认值"[^>]*>([\s\S]*?)<\/ConfigTestElement>/g;
        var m;
        while ((m = re.exec(xml)) !== null) {
            var body = m[1];
            if (body.indexOf('HTTPSampler.domain') < 0 && body.indexOf('HTTPSampler.protocol') < 0 && body.indexOf('HTTPSampler.port') < 0) {
                n += 1;
            }
        }
        return n;
    }

    function shouldBlockDownload() {
        var r = global.__jmsJmxExportSelfCheckV2Last;
        return !!(r && r.blockDownload);
    }

    function getLast() { return global.__jmsJmxExportSelfCheckV2Last || null; }

    global.JmsJmxExportSelfCheckV2 = {
        run: runV2,
        getLast: getLast,
        shouldBlockDownload: shouldBlockDownload
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_mount_jmx.js ---- */
/**
 * catalog 挂载区 hashTree 子项 JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function genMountItemsXml(list, indent, helpers) {
        if (!list || !list.length) return '';
        var R = global.JmsCatalogJmxRegistry;
        var xml = '';
        list.forEach(function (item) {
            if (!item) return;
            if (R && typeof R.writeStep === 'function') {
                xml += R.writeStep(item, indent, helpers);
            } else if (global.JmxCatalogElement && typeof global.JmxCatalogElement.genXml === 'function') {
                xml += global.JmxCatalogElement.genXml(item, indent, helpers);
            }
        });
        return xml;
    }

    global.JmsCatalogMountJmx = {
        genMountItemsXml: genMountItemsXml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_http_sampler_jmx.js ---- */
/**
 * catalog HTTP 取样器 · catalog_props 完整 JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s);
    }

    function injectHashChildren(xml, indent, hashChildren, helpers) {
        if (!hashChildren || !hashChildren.length) return xml;
        var M = global.JmsCatalogMountJmx;
        if (!M || typeof M.genMountItemsXml !== 'function') return xml;
        var mountXml = M.genMountItemsXml(hashChildren, indent + '  ', helpers);
        if (!mountXml) return xml;
        var emptyTag = indent + '<hashTree/>\n';
        if (xml.indexOf(emptyTag) >= 0) {
            return xml.replace(emptyTag, indent + '<hashTree>\n' + mountXml + indent + '</hashTree>\n');
        }
        var close = indent + '</hashTree>\n';
        var idx = xml.lastIndexOf(close);
        if (idx >= 0) {
            return xml.slice(0, idx) + mountXml + xml.slice(idx);
        }
        return xml + mountXml;
    }

    function isHttpAlias(alias) {
        return alias === 'HTTPSamplerProxy' || alias === 'HTTPSampler' || alias === 'HTTPSampler2';
    }

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element' || !isHttpAlias(step.alias)) return '';
        var P = global.JmsCatalogJmxPrepare;
        var flat = P && typeof P.flattenHttpCatalogStep === 'function'
            ? P.flattenHttpCatalogStep(step)
            : (step.catalog_props || {});
        if (!flat.method) return '';
        if (!helpers || typeof helpers.genSingleStepXml !== 'function') return '';
        var EX = global.JmsCatalogExtractExportV1;
        var flatForGen = EX && typeof EX.prepareFlatForGenSingleHttp === 'function'
            ? EX.prepareFlatForGenSingleHttp(flat)
            : flat;
        var xml = helpers.genSingleStepXml(flatForGen, 0, indent, {});
        if (EX && typeof EX.injectExtractorsIntoSamplerXml === 'function') {
            xml = EX.injectExtractorsIntoSamplerXml(xml, flat, indent, helpers);
        }
        var hashKids = step.catalog_hash_children;
        if (hashKids && hashKids.length) {
            var ORD = global.JmsCatalogSamplerChildrenOrderV1;
            if (ORD && typeof ORD.injectOrderedHashChildren === 'function') {
                xml = ORD.injectOrderedHashChildren(xml, indent, hashKids, helpers);
            } else {
                xml = injectHashChildren(xml, indent, hashKids, helpers);
            }
        }
        return xml;
    }

    global.JmsCatalogHttpSamplerJmx = {
        isHttpAlias: isHttpAlias,
        genXml: genXml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_controller_jmx.js ---- */
/**
 * catalog 逻辑控制器 · catalog_props 完整 JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s);
    }

    function legacy(step) {
        var P = global.JmsCatalogJmxPrepare;
        return P && typeof P.legacyItemFromCatalog === 'function' ? P.legacyItemFromCatalog(step) : (step.catalog_props || {});
    }

    function genHashTree(step, indent, helpers) {
        var xml = indent + '<hashTree>\n';
        var pad = indent + '  ';
        var M = global.JmsCatalogMountJmx;
        if (M && typeof M.genMountItemsXml === 'function' && step.catalog_hash_children && step.catalog_hash_children.length) {
            xml += M.genMountItemsXml(step.catalog_hash_children, pad, helpers);
        }
        var A = global.JmxScenarioAdvanced;
        if (A && typeof A.genStepsTreeXml === 'function') {
            xml += A.genStepsTreeXml(step.children || [], pad, helpers || {});
        }
        xml += indent + '</hashTree>\n';
        return xml;
    }

    function genIf(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<IfController guiclass="IfControllerPanel" testclass="IfController" testname="' +
            e(item.name || 'If 控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <stringProp name="IfController.condition">' + e(item.condition || '', helpers) + '</stringProp>\n';
        xml += indent + '  <boolProp name="IfController.evaluateAll">' + (item.evaluate_all ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="IfController.useExpression">' + (item.use_expression !== false ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</IfController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genLoop(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var forever = !!item.loop_forever;
        var loopsVal = forever ? '-1' : String(Number(item.loops) > 0 ? Number(item.loops) : 1);
        var xml = indent + '<LoopController guiclass="LoopControlPanel" testclass="LoopController" testname="' +
            e(item.name || '循环控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="LoopController.continue_forever">' + (forever ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '  <intProp name="LoopController.loops">' + loopsVal + '</intProp>\n';
        xml += indent + '</LoopController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genTxn(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="' +
            e(item.name || '事务控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="TransactionController.parent">' + (item.generate_parent_sample ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="TransactionController.includeTimers">' + (item.include_timer_duration ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</TransactionController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genRandom(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<RandomController guiclass="RandomControlGui" testclass="RandomController" testname="' +
            e(item.name || '随机控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="RandomController.ignoreSubControllerBlocks">' + (item.ignore_sub_controller_blocks ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</RandomController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genSimple(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<GenericController guiclass="LogicControllerGui" testclass="GenericController" testname="' +
            e(item.name || '简单控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</GenericController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genInclude(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var path = item.includepath || item.include_path || '';
        var xml = indent + '<IncludeController guiclass="IncludeControllerGui" testclass="IncludeController" testname="' +
            e(item.name || 'Include 控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <stringProp name="IncludeController.includepath">' + e(path, helpers) + '</stringProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</IncludeController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    var MAP = {
        IfController: genIf,
        LoopController: genLoop,
        TransactionController: genTxn,
        RandomController: genRandom,
        GenericController: genSimple,
        IncludeController: genInclude
    };

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element' || !step.container) return '';
        var fn = MAP[step.alias];
        if (!fn) return '';
        return fn(step, indent, helpers);
    }

    global.JmsCatalogControllerJmx = {
        genXml: genXml,
        MAP: MAP
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_step_csv_data_set_jmx.js ---- */
/**
 * HTTP 步骤配置元件 · CSV 数据文件设置 · JMX 导入/导出（隔离模块）
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

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                return (nodes[i].textContent || '').trim().toLowerCase() === 'true';
            }
        }
        return def;
    }

    function parseFromEl(el, testname) {
        return {
            name: testname || '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            filename: getStringProp(el, 'filename') || '',
            file_encoding: getStringProp(el, 'fileEncoding') || 'UTF-8',
            variable_names: getStringProp(el, 'variableNames') || '',
            ignore_first_line: getBoolProp(el, 'ignoreFirstLine', false),
            delimiter: getStringProp(el, 'delimiter') || ',',
            quoted_data: getBoolProp(el, 'quotedData', false),
            recycle: getBoolProp(el, 'recycle', true),
            stop_thread: getBoolProp(el, 'stopThread', false),
            share_mode: getStringProp(el, 'shareMode') || 'shareMode.all',
            file_content: ''
        };
    }

    function genCsvDataSetXml(d, indent, escapeXml) {
        if (!d || !d.enabled) return '';
        var filename = d.filename ? String(d.filename).trim() : '';
        if (!filename && !d.file_content) return '';
        if (!filename) filename = 'data/data.csv';
        var testname = (d.name && String(d.name).trim()) || 'CSV 数据文件设置';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="filename">' + escapeXml(filename) + '</stringProp>\n';
        xml += indent + '  <stringProp name="fileEncoding">' + escapeXml(d.file_encoding || 'UTF-8') + '</stringProp>\n';
        xml += indent + '  <stringProp name="variableNames">' + escapeXml(d.variable_names || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="ignoreFirstLine">' + (d.ignore_first_line ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <stringProp name="delimiter">' + escapeXml(d.delimiter !== undefined ? String(d.delimiter) : ',') + '</stringProp>\n';
        xml += indent + '  <boolProp name="quotedData">' + (d.quoted_data ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="recycle">' + (d.recycle !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="stopThread">' + (d.stop_thread ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <stringProp name="shareMode">' + escapeXml(d.share_mode || 'shareMode.all') + '</stringProp>\n';
        xml += indent + '</CSVDataSet>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsStepCsvDataSetJmx = {
        parseFromEl: parseFromEl,
        genCsvDataSetXml: genCsvDataSetXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_step_cookie_manager_jmx.js ---- */
/**
 * HTTP 步骤配置元件 · HTTP Cookie 管理器 · 数据规范化与 JMX（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULT_POLICY = 'standard';

    var POLICY_OPTIONS = [
        { value: 'standard', label: 'standard' },
        { value: 'standard-strict', label: 'standard-strict' },
        { value: 'ignoreCookies', label: 'ignoreCookies' },
        { value: 'netscape', label: 'netscape' },
        { value: 'default', label: 'default' },
        { value: 'rfc2109', label: 'rfc2109' },
        { value: 'rfc2965', label: 'rfc2965' },
        { value: 'best-match', label: 'best-match' },
        { value: 'compatibility', label: 'compatibility' }
    ];

    var POLICY_VALUES = POLICY_OPTIONS.map(function (o) { return o.value; });

    function normalizeCookiePolicy(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (!v) return DEFAULT_POLICY;
        if (POLICY_VALUES.indexOf(v) >= 0) return v;
        if (v === 'compatbility') return 'compatibility';
        return DEFAULT_POLICY;
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                return (nodes[i].textContent || '').trim().toLowerCase() === 'true';
            }
        }
        return def;
    }

    function getLongProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('longProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return def;
    }

    function parseCookiesFromEl(el) {
        var cookies = [];
        if (!el) return cookies;
        var coll = el.querySelector('collectionProp[name="CookieManager.cookies"]');
        if (!coll) return cookies;
        var props = coll.getElementsByTagName('elementProp');
        for (var i = 0; i < props.length; i++) {
            var cp = props[i];
            if (cp.getAttribute('elementType') !== 'Cookie') continue;
            var name = (cp.getAttribute('name') || getStringProp(cp, 'Cookie.name') || '').trim();
            if (!name) continue;
            cookies.push({
                name: name,
                value: getStringProp(cp, 'Cookie.value') || '',
                domain: getStringProp(cp, 'Cookie.domain') || '',
                path: getStringProp(cp, 'Cookie.path') || '/',
                secure: getBoolProp(cp, 'Cookie.secure', false),
                expires: getLongProp(cp, 'Cookie.expires', '0')
            });
        }
        return cookies;
    }

    function parseFromEl(el, testname) {
        return {
            name: testname || '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            clear_each_iteration: getBoolProp(el, 'CookieManager.clearEachIteration', true),
            cookie_policy: normalizeCookiePolicy(getStringProp(el, 'CookieManager.cookiePolicy')),
            cookies: parseCookiesFromEl(el)
        };
    }

    function hasNonDefaultOptions(d) {
        if (!d) return false;
        if (d.clear_each_iteration === false) return true;
        return normalizeCookiePolicy(d.cookie_policy) !== DEFAULT_POLICY;
    }

    function hasContent(d) {
        if (!d) return false;
        if ((d.cookies || []).some(function (c) { return c && String(c.name || '').trim(); })) return true;
        if (String(d.name || '').trim() || String(d.comments || '').trim()) return true;
        return hasNonDefaultOptions(d);
    }

    function shouldExport(d) {
        if (!d) return false;
        return hasContent(d);
    }

    function genCookieManagerXml(d, indent, escapeXml) {
        if (!d || !shouldExport(d)) return '';
        var cookies = (d.cookies || []).filter(function (c) { return c && String(c.name || '').trim(); });
        var clear = d.clear_each_iteration !== false ? 'true' : 'false';
        var policy = normalizeCookiePolicy(d.cookie_policy);
        var testname = (d.name && String(d.name).trim()) || 'HTTP Cookie 管理器';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="CookieManager.cookies">\n';
        cookies.forEach(function (c) {
            var cname = escapeXml(String(c.name));
            xml += indent + '    <elementProp name="' + cname + '" elementType="Cookie">\n';
            xml += indent + '      <stringProp name="Cookie.name">' + cname + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.value">' + escapeXml(c.value || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.domain">' + escapeXml(c.domain || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.path">' + escapeXml(c.path || '/') + '</stringProp>\n';
            xml += indent + '      <boolProp name="Cookie.secure">' + (c.secure ? 'true' : 'false') + '</boolProp>\n';
            xml += indent + '      <longProp name="Cookie.expires">' + escapeXml(c.expires || '0') + '</longProp>\n';
            xml += indent + '    </elementProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        xml += indent + '  <boolProp name="CookieManager.clearEachIteration">' + clear + '</boolProp>\n';
        if (policy !== DEFAULT_POLICY) {
            xml += indent + '  <stringProp name="CookieManager.cookiePolicy">' + escapeXml(policy) + '</stringProp>\n';
        }
        xml += indent + '</CookieManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsStepCookieManagerJmx = {
        DEFAULT_POLICY: DEFAULT_POLICY,
        POLICY_OPTIONS: POLICY_OPTIONS,
        normalizeCookiePolicy: normalizeCookiePolicy,
        parseFromEl: parseFromEl,
        hasContent: hasContent,
        genCookieManagerXml: genCookieManagerXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_step_cache_manager_jmx.js ---- */
/**
 * HTTP 步骤配置元件 · HTTP 缓存管理器 · 数据规范化与 JMX（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULT_MAX_SIZE = '5000';

    function normalizeMaxSize(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (!v) return DEFAULT_MAX_SIZE;
        var n = parseInt(v, 10);
        if (!isFinite(n) || n < 1) return DEFAULT_MAX_SIZE;
        return String(n);
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                return (nodes[i].textContent || '').trim().toLowerCase() === 'true';
            }
        }
        return def;
    }

    function getIntProp(el, name, def) {
        if (!el) return def;
        var tags = ['intProp', 'longProp', 'stringProp'];
        for (var t = 0; t < tags.length; t++) {
            var nodes = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].getAttribute('name') === name) {
                    var v = (nodes[i].textContent || '').trim();
                    if (v !== '') return v;
                }
            }
        }
        return def;
    }

    function parseFromEl(el, testname) {
        return {
            name: testname || '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            clear_each_iteration: getBoolProp(el, 'clearEachIteration', false),
            use_expires: getBoolProp(el, 'useExpires', true),
            max_size: normalizeMaxSize(getIntProp(el, 'maxSize', DEFAULT_MAX_SIZE))
        };
    }

    function genCacheManagerXml(d, indent, escapeXml) {
        if (!d) return '';
        var clear = d.clear_each_iteration === true ? 'true' : 'false';
        var expires = d.use_expires !== false ? 'true' : 'false';
        var maxSize = normalizeMaxSize(d.max_size);
        var testname = (d.name && String(d.name).trim()) || 'HTTP 缓存管理器';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CacheManager guiclass="CacheManagerGui" testclass="CacheManager" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <boolProp name="clearEachIteration">' + clear + '</boolProp>\n';
        xml += indent + '  <boolProp name="useExpires">' + expires + '</boolProp>\n';
        if (maxSize !== DEFAULT_MAX_SIZE) {
            xml += indent + '  <intProp name="maxSize">' + escapeXml(maxSize) + '</intProp>\n';
        }
        xml += indent + '</CacheManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsStepCacheManagerJmx = {
        DEFAULT_MAX_SIZE: DEFAULT_MAX_SIZE,
        normalizeMaxSize: normalizeMaxSize,
        parseFromEl: parseFromEl,
        genCacheManagerXml: genCacheManagerXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_step_auth_manager_jmx.js ---- */
/**
 * HTTP 步骤配置元件 · HTTP 授权管理器 · 数据规范化与 JMX（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULT_MECHANISM = 'BASIC_DIGEST';

    var MECHANISM_OPTIONS = [
        { value: 'BASIC_DIGEST', label: 'BASIC_DIGEST' },
        { value: 'BASIC', label: 'BASIC' },
        { value: 'DIGEST', label: 'DIGEST' },
        { value: 'KERBEROS', label: 'KERBEROS' }
    ];

    var MECHANISM_VALUES = MECHANISM_OPTIONS.map(function (o) { return o.value; });

    function normalizeMechanism(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (!v) return DEFAULT_MECHANISM;
        if (MECHANISM_VALUES.indexOf(v) >= 0) return v;
        if (v.toUpperCase() === 'BASIC_DIGEST') return 'BASIC_DIGEST';
        return DEFAULT_MECHANISM;
    }

    function normalizeAuthorizations(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(function (row) {
            if (!row || typeof row !== 'object') {
                return { url: '', username: '', password: '', domain: '', realm: '', mechanism: DEFAULT_MECHANISM };
            }
            return {
                url: row.url != null ? String(row.url) : '',
                username: row.username != null ? String(row.username) : '',
                password: row.password != null ? String(row.password) : '',
                domain: row.domain != null ? String(row.domain) : '',
                realm: row.realm != null ? String(row.realm) : '',
                mechanism: normalizeMechanism(row.mechanism)
            };
        });
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                return (nodes[i].textContent || '').trim().toLowerCase() === 'true';
            }
        }
        return def;
    }

    function parseAuthRowFromEl(rowEl) {
        return {
            url: getStringProp(rowEl, 'Authorization.url'),
            username: getStringProp(rowEl, 'Authorization.username'),
            password: getStringProp(rowEl, 'Authorization.password'),
            domain: getStringProp(rowEl, 'Authorization.domain'),
            realm: getStringProp(rowEl, 'Authorization.realm'),
            mechanism: normalizeMechanism(getStringProp(rowEl, 'Authorization.mechanism'))
        };
    }

    function parseAuthListFromEl(el) {
        if (!el) return [];
        var out = [];
        var coll = el.querySelector('collectionProp[name="AuthManager.auth_list"]');
        if (!coll) return out;
        var rows = coll.querySelectorAll('elementProp[elementType="Authorization"]');
        for (var i = 0; i < rows.length; i++) {
            var row = parseAuthRowFromEl(rows[i]);
            if (row.url || row.username || row.password || row.domain || row.realm) out.push(row);
        }
        return out;
    }

    function parseFromEl(el, testname) {
        return {
            name: testname || '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            clear_each_iteration: getBoolProp(el, 'AuthManager.clearEachIteration', false),
            authorizations: parseAuthListFromEl(el)
        };
    }

    function hasContent(d) {
        if (!d) return false;
        if (String(d.name || '').trim() || String(d.comments || '').trim()) return true;
        if (d.clear_each_iteration === true) return true;
        return (d.authorizations || []).some(function (row) {
            return row && (String(row.url || '').trim() || String(row.username || '').trim() ||
                String(row.password || '').trim() || String(row.domain || '').trim() || String(row.realm || '').trim());
        });
    }

    function shouldExport(d) {
        return hasContent(d);
    }

    function genAuthManagerXml(d, indent, escapeXml) {
        if (!d || !shouldExport(d)) return '';
        var rows = (d.authorizations || []).filter(function (row) {
            return row && (String(row.url || '').trim() || String(row.username || '').trim() ||
                String(row.password || '').trim() || String(row.domain || '').trim() || String(row.realm || '').trim());
        });
        if (!rows.length && d.clear_each_iteration !== true && !String(d.name || '').trim()) return '';
        var testname = (d.name && String(d.name).trim()) || 'HTTP 授权管理器';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<AuthManager guiclass="AuthPanel" testclass="AuthManager" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="AuthManager.auth_list">\n';
        rows.forEach(function (row, idx) {
            xml += indent + '    <elementProp name="' + escapeXml(String(idx)) + '" elementType="Authorization">\n';
            xml += indent + '      <stringProp name="Authorization.url">' + escapeXml(row.url || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.username">' + escapeXml(row.username || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.password">' + escapeXml(row.password || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.domain">' + escapeXml(row.domain || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.realm">' + escapeXml(row.realm || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.mechanism">' + escapeXml(normalizeMechanism(row.mechanism)) + '</stringProp>\n';
            xml += indent + '    </elementProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        xml += indent + '  <boolProp name="AuthManager.clearEachIteration">' + (d.clear_each_iteration === true ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</AuthManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsStepAuthManagerJmx = {
        DEFAULT_MECHANISM: DEFAULT_MECHANISM,
        MECHANISM_OPTIONS: MECHANISM_OPTIONS,
        normalizeMechanism: normalizeMechanism,
        normalizeAuthorizations: normalizeAuthorizations,
        parseFromEl: parseFromEl,
        hasContent: hasContent,
        genAuthManagerXml: genAuthManagerXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_config_jmx.js ---- */
/**
 * catalog 配置元件 · catalog_props 完整 JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s);
    }

    function escapeFn(helpers) {
        return function (s) { return esc(s, helpers); };
    }

    function props(step) {
        return (step && step.catalog_props) || {};
    }

    function genCsv(step, indent, helpers) {
        var J = global.JmsStepCsvDataSetJmx;
        if (!J || typeof J.genCsvDataSetXml !== 'function') return '';
        var d = Object.assign({ enabled: step.enabled !== false }, props(step));
        return J.genCsvDataSetXml(d, indent, escapeFn(helpers));
    }

    function genCookie(step, indent, helpers) {
        var J = global.JmsStepCookieManagerJmx;
        if (!J || typeof J.genCookieManagerXml !== 'function') return '';
        var d = Object.assign({ enabled: step.enabled !== false }, props(step));
        return J.genCookieManagerXml(d, indent, escapeFn(helpers));
    }

    function genCache(step, indent, helpers) {
        var J = global.JmsStepCacheManagerJmx;
        if (!J || typeof J.genCacheManagerXml !== 'function') return '';
        var d = Object.assign({ enabled: step.enabled !== false }, props(step));
        return J.genCacheManagerXml(d, indent, escapeFn(helpers));
    }

    function genCounter(step, indent, helpers) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genCounterXml !== 'function') return '';
        var d = Object.assign({ enabled: step.enabled !== false }, props(step));
        return E.genCounterXml(d, indent, escapeFn(helpers));
    }

    function genHttpDefaults(step, indent, helpers) {
        var P = global.JmsPlanCatalogJmxProps;
        if (P && typeof P.genHttpDefaultsFromCatalog === 'function') {
            return P.genHttpDefaultsFromCatalog(step, indent);
        }
        return '';
    }

    function genHeader(step, indent, helpers) {
        var P = global.JmsPlanCatalogJmxProps;
        if (P && typeof P.genHeaderManagerXml === 'function') {
            return P.genHeaderManagerXml(step, indent);
        }
        return '';
    }

    function genArguments(step, indent, helpers) {
        var P = global.JmsPlanCatalogJmxProps;
        if (P && typeof P.genArgumentsXml === 'function') {
            return P.genArgumentsXml(step, indent);
        }
        return '';
    }

    function genAuth(step, indent, helpers) {
        var J = global.JmsStepAuthManagerJmx;
        if (!J || typeof J.genAuthManagerXml !== 'function') return '';
        var d = Object.assign({ enabled: step.enabled !== false, name: step.name }, props(step));
        return J.genAuthManagerXml(d, indent, escapeFn(helpers));
    }

    var MAP = {
        CSVDataSet: genCsv,
        CookieManager: genCookie,
        CacheManager: genCache,
        CounterConfig: genCounter,
        ConfigTestElement: genHttpDefaults,
        HeaderManager: genHeader,
        Arguments: genArguments,
        AuthManager: genAuth
    };

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element') return '';
        var fn = MAP[step.alias];
        if (!fn) return '';
        return fn(step, indent, helpers);
    }

    global.JmsCatalogConfigJmx = {
        genXml: genXml,
        MAP: MAP
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_aux_jmx.js ---- */
/**
 * catalog 定时器/处理器/取样器/监听器 · catalog_props JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s);
    }

    function escapeFn(helpers) {
        return function (s) { return esc(s, helpers); };
    }

    function legacy(step) {
        var P = global.JmsCatalogJmxPrepare;
        return P && typeof P.legacyItemFromCatalog === 'function' ? P.legacyItemFromCatalog(step) : (step.catalog_props || {});
    }

    function genConstantTimer(step, indent, helpers) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genConstantTimerXml !== 'function') return '';
        var item = legacy(step);
        var cfg = {
            enabled: step.enabled !== false,
            name: step.name || item.name || '固定定时器',
            comments: item.comments || '',
            delay_ms: item.delay_ms !== undefined ? item.delay_ms : (item.delay !== undefined ? item.delay : 300)
        };
        return E.genConstantTimerXml(cfg, indent, escapeFn(helpers));
    }

    function genDebugSampler(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<DebugSampler guiclass="TestBeanGUI" testclass="DebugSampler" testname="' +
            e(item.name || 'Debug Sampler', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <boolProp name="displayJMeterProperties">' + (item.display_jmeter_properties ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displayJMeterVariables">' + (item.display_jmeter_variables !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displaySystemProperties">' + (item.display_system_properties ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</DebugSampler>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genRegexExtractor(step, indent, helpers) {
        var item = legacy(step);
        var J = global.JmxRegexExtractor;
        if (J && typeof J.genRegexExtractorXml === 'function') {
            return J.genRegexExtractorXml(Object.assign({ type: 'regex_extract' }, item), indent, escapeFn(helpers));
        }
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="' +
            e(item.name || ('正则表达式提取器 ' + (item.refname || '')), helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="RegexExtractor.refname">' + e(item.refname || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.regex">' + e(item.regex || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.template">' + e(item.template != null ? String(item.template) : '$1$', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.default">' + e(item.default_value != null ? String(item.default_value) : '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.match_number">' + e(item.match_number != null ? String(item.match_number) : '1', helpers) + '</stringProp>\n';
        xml += indent + '</RegexExtractor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genJsonPostProcessor(step, indent, helpers) {
        var item = legacy(step);
        var J = global.JmxJsonPostProcessor;
        if (J && typeof J.genJsonPostProcessorXml === 'function') {
            var proc = Object.assign({ type: 'json_post' }, item);
            if (!proc.var && item.referenceNames) proc.var = item.referenceNames;
            if (!proc.json_path && item.jsonPathExprs) proc.json_path = item.jsonPathExprs;
            return J.genJsonPostProcessorXml(proc, indent, escapeFn(helpers));
        }
        return '';
    }

    function genBeanShellPost(step, indent, helpers) {
        var item = legacy(step);
        var B = global.JmsTgBeanshellPostJmx;
        if (B && typeof B.genXml === 'function') {
            return B.genXml(Object.assign({ type: 'beanshell_post' }, item), indent, escapeFn(helpers));
        }
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPostProcessor guiclass="TestBeanGUI" testclass="BeanShellPostProcessor" testname="' +
            e(item.name || 'BeanShell PostProcessor', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">false</boolProp>\n';
        xml += indent + '  <stringProp name="script">' + e(item.script || '', helpers) + '</stringProp>\n';
        xml += indent + '</BeanShellPostProcessor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genBeanShellPre(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPreProcessor guiclass="TestBeanGUI" testclass="BeanShellPreProcessor" testname="' +
            e(item.name || 'BeanShell PreProcessor', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">false</boolProp>\n';
        xml += indent + '  <stringProp name="script">' + e(item.script || '', helpers) + '</stringProp>\n';
        xml += indent + '</BeanShellPreProcessor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genXPathExtractor(step, indent, helpers) {
        var item = legacy(step);
        var X = global.JmxXPathExtractor;
        if (X && typeof X.genXPathExtractorXml === 'function') {
            return X.genXPathExtractorXml(Object.assign({ type: 'xpath_extract' }, item), indent, escapeFn(helpers));
        }
        return '';
    }

    function genJsR223Post(step, indent, helpers) {
        var item = legacy(step);
        var J = global.JmxJsr223PostProcessor;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(Object.assign({ type: 'jsr223_post' }, item), indent, escapeFn(helpers));
        }
        return '';
    }

    function genBackendListener(step, indent, helpers) {
        var P = global.JmsPlanCatalogJmxProps;
        if (P && typeof P.genBackendListenerFromCatalog === 'function') {
            return P.genBackendListenerFromCatalog(step, indent);
        }
        return '';
    }

    function genViewResults(step, indent, helpers) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genViewResultsTreeXml !== 'function') return '';
        return E.genViewResultsTreeXml(indent, escapeFn(helpers), step.name || '查看结果树', {});
    }

    function genAggregate(step, indent, helpers) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genAggregateReportXml !== 'function') return '';
        return E.genAggregateReportXml(indent, escapeFn(helpers), step.name || '聚合报告', {});
    }

    function genUserParameters(step, indent, helpers) {
        var item = legacy(step);
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genUserParametersXml !== 'function') return '';
        return E.genUserParametersXml({
            enabled: step.enabled !== false,
            name: step.name || item.name || '用户参数',
            per_iteration: item.per_iteration,
            params: item.params || []
        }, indent, escapeFn(helpers));
    }

    function genResponseAssertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'response_assert';
        var J = global.JmsHttpResponseAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }

    function genJsonAssertion(step, indent, helpers) {
        var item = legacy(step);
        var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA && typeof JA.toLegacyProps === 'function') {
            item = Object.assign({}, item, JA.toLegacyProps(item));
        }
        item.type = item.type || 'json_assert';
        var J = global.JmsHttpJsonAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }

    function genSizeAssertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'size_assert';
        var J = global.JmsHttpSizeAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }

    function genMd5HexAssertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'md5hex_assert';
        var D = global.JmsAssertionExportIncludeDisabledV1;
        if (D && typeof D.genAssertionXml === 'function') {
            return D.genAssertionXml(item, step.name || '', indent, escapeFn(helpers));
        }
        var J = global.JmsHttpMd5hexAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }


    function genJsR223Assertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'jsr223_assert';
        var J = global.JmxJsr223Assertion;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, step.name || '', indent, escapeFn(helpers));
        }
        return '';
    }

    function genJdbcPost(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var dataSource = item.dataSource || item.data_source || '';
        var variableNames = item.variableNames || item.variable_names || '';
        var resultVariable = item.resultVariable || item.result_variable || '';
        var queryTypes = item.queryTypes || item.query_types || item.query_type || '';
        var xml = indent + '<JDBCPostProcessor guiclass="TestBeanGUI" testclass="JDBCPostProcessor" testname="' +
            e(item.name || 'JDBC PostProcessor', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="dataSource">' + e(dataSource, helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="query">' + e(item.query || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryArguments">' + e(item.queryArguments || item.query_arguments || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryTypes">' + e(queryTypes, helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="variableNames">' + e(variableNames, helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultVariable">' + e(resultVariable, helpers) + '</stringProp>\n';
        xml += indent + '</JDBCPostProcessor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    var MAP = {
        ConstantTimer: genConstantTimer,
        DebugSampler: genDebugSampler,
        RegexExtractor: genRegexExtractor,
        JSONPostProcessor: genJsonPostProcessor,
        BeanShellPostProcessor: genBeanShellPost,
        BeanShellPreProcessor: genBeanShellPre,
        XPathExtractor: genXPathExtractor,
        JSR223PostProcessor: genJsR223Post,
        BackendListener: genBackendListener,
        ViewResultsFullVisualizer: genViewResults,
        StatVisualizer: genAggregate,
        ResultCollector: genAggregate,
        UserParameters: genUserParameters,
        ResponseAssertion: genResponseAssertion,
        JSONPathAssertion: genJsonAssertion,
        SizeAssertion: genSizeAssertion,
        JDBCPostProcessor: genJdbcPost,
        MD5HexAssertion: genMd5HexAssertion,
        JSR223Assertion: genJsR223Assertion
    };

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element') return '';
        var fn = MAP[step.alias];
        if (!fn) return '';
        return fn(step, indent, helpers);
    }

    global.JmsCatalogAuxJmx = {
        genXml: genXml,
        MAP: MAP
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_jmx_registry.js ---- */
/**
 * catalog 配置写出中心 · 按 alias 路由专用写出器（隔离模块）
 */
(function (global) {
    'use strict';

    function writeStep(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element') return '';
        var P = global.JmsCatalogJmxPrepare;
        var prepared = P && typeof P.prepareStepForExport === 'function' ? P.prepareStepForExport(step) : step;
        var writers = [
            global.JmsCatalogHttpSamplerJmx,
            global.JmsCatalogControllerJmx,
            global.JmsCatalogConfigJmx,
            global.JmsCatalogAuxJmx
        ];
        var i, mod, xml;
        for (i = 0; i < writers.length; i += 1) {
            mod = writers[i];
            if (!mod || typeof mod.genXml !== 'function') continue;
            if (mod === global.JmsCatalogHttpSamplerJmx) {
                if (!mod.isHttpAlias || !mod.isHttpAlias(prepared.alias)) continue;
            } else if (mod.MAP && !mod.MAP[prepared.alias]) {
                continue;
            }
            xml = mod.genXml(prepared, indent, helpers || {});
            if (xml) return xml;
        }
        var Plan = global.JmsPlanCatalogJmxProps;
        if (Plan && typeof Plan.tryGenFromProps === 'function') {
            xml = Plan.tryGenFromProps(prepared, indent);
            if (xml) return xml;
        }
        return '';
    }

    global.JmsCatalogJmxRegistry = {
        writeStep: writeStep
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jmx_catalog_element.js ---- */
/**
 * JMeter catalog_element · JMX 序列化（隔离模块，不修改 genJmx 核心逻辑）
 */
(function (global) {
    'use strict';

    function escapeXml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function applyTestName(fragment, name) {
        var n = escapeXml(name || 'Catalog Element');
        return String(fragment || '').replace(/testname="[^"]*"/, 'testname="' + n + '"');
    }

    function shouldSkipLegacyFallback(step) {
        if (!step || !step.alias) return false;
        var maps = [
            global.JmsCatalogHttpSamplerJmx,
            global.JmsCatalogControllerJmx,
            global.JmsCatalogConfigJmx,
            global.JmsCatalogAuxJmx
        ];
        var i, mod;
        for (i = 0; i < maps.length; i += 1) {
            mod = maps[i];
            if (mod && mod.MAP && mod.MAP[step.alias]) return true;
        }
        return false;
    }

    function legacyFallbackXml(step, indent, helpers) {
        var esc = (helpers && helpers.escapeXml) || escapeXml;
        var en = step.enabled === false ? 'false' : 'true';
        var fragment = step.jmx_fragment || '';
        if (!fragment && step.alias) {
            fragment = '<' + step.alias + ' guiclass="' + esc(step.guiclass || step.alias + 'Gui') +
                '" testclass="' + esc(step.testclass || step.alias) +
                '" testname="' + esc(step.name || step.alias) + '" enabled="' + en + '"></' + step.alias + '>';
        }
        fragment = applyTestName(fragment, step.name || step.label_zh || step.alias);
        fragment = fragment.replace(/enabled="(true|false)"/, 'enabled="' + en + '"');
        var lines = fragment.split('\n');
        var xml = '';
        lines.forEach(function (line) {
            xml += indent + line + '\n';
        });
        if (step.container) {
            xml += indent + '<hashTree>\n';
            var pad = indent + '  ';
            var M = global.JmsCatalogMountJmx;
            if (M && typeof M.genMountItemsXml === 'function' && step.catalog_hash_children && step.catalog_hash_children.length) {
                xml += M.genMountItemsXml(step.catalog_hash_children, pad, helpers || {});
            }
            if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.genStepsTreeXml === 'function') {
                xml += global.JmxScenarioAdvanced.genStepsTreeXml(step.children || [], pad, helpers || {});
            }
            xml += indent + '</hashTree>\n';
        } else {
            xml += indent + '<hashTree/>\n';
        }
        return xml;
    }

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element') return '';
        var R = global.JmsCatalogJmxRegistry;
        if (R && typeof R.writeStep === 'function') {
            var routed = R.writeStep(step, indent, helpers || {});
            if (routed) return routed;
        }
        if (global.JmsPlanCatalogJmxProps && typeof global.JmsPlanCatalogJmxProps.tryGenFromProps === 'function') {
            var propsXml = global.JmsPlanCatalogJmxProps.tryGenFromProps(step, indent);
            if (propsXml) return propsXml;
        }
        if (shouldSkipLegacyFallback(step)) return '';
        return legacyFallbackXml(step, indent, helpers);
    }

    function isCatalogStep(st) {
        return !!(st && st.type === 'catalog_element');
    }

    global.JmxCatalogElement = {
        genXml: genXml,
        isCatalogStep: isCatalogStep,
        escapeXml: escapeXml,
        legacyFallbackXml: legacyFallbackXml
    };
})(window);

/* ---- js/jms_catalog_tg_yaml_serializer.js ---- */
﻿/**
 * Phase1 收尾 · 线程组 YAML 仅输出 catalog 字段（独立模块）
 */
(function (global) {
    'use strict';

    function numOr(v, d) {
        var n = Number(v);
        return isNaN(n) ? d : n;
    }

    function threadGroupToYaml(tg, helpers) {
        helpers = helpers || {};
        if (!tg) return {};
        var varsToObj = helpers.varsToObj || function () { return {}; };
        var stepsToYamlTree = helpers.stepsToYamlTree || function (s) { return s || []; };
        var appendTgAssertionsYaml = helpers.appendTgAssertionsYaml || function () {};

        var out = {
            name: tg.name,
            load: {
                users: numOr(tg.load && tg.load.users, 1),
                spawn_rate: numOr(tg.load && tg.load.spawn_rate, 1),
                duration_sec: numOr(tg.load && tg.load.duration_sec, 60),
                loops: tg.load && tg.load.loops !== undefined ? numOr(tg.load.loops, -1) : -1
            },
            variables: varsToObj(tg.variables),
            steps: stepsToYamlTree(tg.steps || [])
        };

        if (tg.processors && tg.processors.length) out.processors = tg.processors;
        if (tg.influx_scenario) {
            out.influxdb = { tags: { scenario: tg.influx_scenario } };
        }

        appendTgAssertionsYaml(out, tg);

        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.applyYamlField === 'function') {
            global.JmsTgDisplayOrder.applyYamlField(out, tg);
        }
        return out;
    }

    global.JmsCatalogTgYamlSerializer = {
        threadGroupToYaml: threadGroupToYaml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_yaml_export_guard.js ---- */
/**
 * YAML 导出前强制 catalog 迁移（独立模块）
 */
(function (global) {
    'use strict';

    function prepareModel(model) {
        if (!model) return model;
        var N = global.JmsScenarioNormalize;
        if (N && typeof N.normalizeModel === 'function') {
            return N.normalizeModel(model, { force: false });
        }
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.migrateModel === 'function') {
            M.migrateModel(model);
        }
        return model;
    }

    global.JmsCatalogYamlExportGuard = {
        prepareModel: prepareModel
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_steps_yaml.js ---- */
/**
 * catalog 步骤 YAML 序列化补充（catalog_hash_children）
 */
(function (global) {
    'use strict';

    function catalogElementToYaml(s) {
        if (!s || s.type !== 'catalog_element') return null;
        var o = {
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
        if (s.catalog_props && typeof s.catalog_props === 'object') o.catalog_props = s.catalog_props;
        if (s.container && Array.isArray(s.children)) {
            o.children = catalogHashChildrenToYaml(s.children);
        }
        if (s.import_order != null) o.import_order = s.import_order;
        return o;
    }

    function catalogHashChildrenToYaml(list) {
        if (!Array.isArray(list)) return [];
        if (global.JmsCatalogSamplerChildren && typeof global.JmsCatalogSamplerChildren.catalogChildToYaml === 'function') {
            return list.map(global.JmsCatalogSamplerChildren.catalogChildToYaml).filter(Boolean);
        }
        return list.map(catalogElementToYaml).filter(Boolean);
    }

    function enrichCatalogStepYaml(catYaml, step) {
        if (!catYaml || !step || step.type !== 'catalog_element') return catYaml;
        if (Array.isArray(step.catalog_hash_children) && step.catalog_hash_children.length) {
            catYaml.catalog_hash_children = catalogHashChildrenToYaml(step.catalog_hash_children);
        }
        return catYaml;
    }

    global.JmsCatalogStepsYaml = {
        enrichCatalogStepYaml: enrichCatalogStepYaml,
        catalogHashChildrenToYaml: catalogHashChildrenToYaml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_steps_yaml_export.js ---- */
/**
 * YAML/JMX 导出前将步骤树统一为 catalog_element（独立模块）
 */
(function (global) {
    'use strict';

    function prepareSteps(list) {
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.stepsListToCatalog === 'function') {
            return M.stepsListToCatalog(list || []);
        }
        return list || [];
    }

    function prepareThreadGroup(tg) {
        if (!tg) return tg;
        var copy = tg;
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.migrateThreadGroup === 'function') {
            M.migrateThreadGroup(copy);
        }
        return copy;
    }

    global.JmsCatalogStepsYamlExport = {
        prepareSteps: prepareSteps,
        prepareThreadGroup: prepareThreadGroup
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_export_catalog_guard.js ---- */
/**
 * JMX 导出 · catalog-first（独立模块，包装 JmxScenarioAdvanced.genStepsTreeXml）
 */
(function (global) {
    'use strict';

    function prepareSteps(steps) {
        var E = global.JmsCatalogStepsYamlExport;
        if (E && typeof E.prepareSteps === 'function') {
            return E.prepareSteps(steps || []);
        }
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.stepsListToCatalog === 'function') {
            return M.stepsListToCatalog(steps || []);
        }
        return steps || [];
    }

    function wrapGenStepsTreeXml() {
        var A = global.JmxScenarioAdvanced;
        if (!A || A.__catalogExportWrapped || typeof A.genStepsTreeXml !== 'function') return;
        var orig = A.genStepsTreeXml;
        A.genStepsTreeXml = function (steps, indent, helpers) {
            return orig.call(A, prepareSteps(steps), indent, helpers);
        };
        A.__catalogExportWrapped = true;
    }

    function init() {
        wrapGenStepsTreeXml();
    }

    global.JmsJmxExportCatalogGuard = {
        prepareSteps: prepareSteps,
        wrapGenStepsTreeXml: wrapGenStepsTreeXml,
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

/* ---- js/jms_catalog_step_compat.js ---- */
/**
 * Catalog 步骤语义 · 统一判断/属性读取（yamlToCatalogStep 仅解析 catalog_element；legacy 由 unify_migrate 处理）
 */
(function (global) {
    'use strict';

    var CTRL_ALIASES = {
        IfController: 1,
        RandomController: 1,
        GenericController: 1,
        TransactionController: 1,
        LoopController: 1
    };

    function isCatalog(step) {
        return !!(step && step.type === 'catalog_element');
    }

    function alias(step) {
        return isCatalog(step) ? String(step.alias || '') : '';
    }

    function prop(step, key, fallback) {
        if (!isCatalog(step) || !step.catalog_props) return fallback;
        var v = step.catalog_props[key];
        return v === undefined || v === null ? fallback : v;
    }

    function isController(step) {
        return isCatalog(step) && !!step.container && step.category === 'controller';
    }

    function isAlias(step, name) {
        return alias(step) === name;
    }

    function isIfController(step) { return isAlias(step, 'IfController'); }
    function isRandomController(step) { return isAlias(step, 'RandomController'); }
    function isSimpleController(step) { return isAlias(step, 'GenericController'); }
    function isTransactionController(step) { return isAlias(step, 'TransactionController'); }
    function isLoopController(step) { return isAlias(step, 'LoopController'); }
    function isLogicContainer(step) {
        return isController(step) && !!CTRL_ALIASES[alias(step)];
    }

    function isHttpSampler(step) {
        return isCatalog(step) && (step.category === 'sampler' || alias(step) === 'HTTPSamplerProxy');
    }

    function isBeanShellPost(step) { return isAlias(step, 'BeanShellPostProcessor'); }
    function isDebugSampler(step) { return isAlias(step, 'DebugSampler'); }
    function isJsonPost(step) { return isAlias(step, 'JSONPostProcessor'); }
    function isRegexExtract(step) { return isAlias(step, 'RegexExtractor'); }
    function isXPathExtract(step) { return isAlias(step, 'XPathExtractor'); }
    function isJsr223Post(step) { return isAlias(step, 'JSR223PostProcessor'); }
    function isJdbcPost(step) { return isAlias(step, 'JDBCPostProcessor'); }

    function isAuxProcessor(step) {
        return isBeanShellPost(step) || isJsonPost(step) || isRegexExtract(step) ||
            isXPathExtract(step) || isJsr223Post(step) || isJdbcPost(step);
    }

    function displayLabel(step) {
        if (!step) return '';
        if (isIfController(step)) return 'If「' + (step.name || '控制器') + '」';
        if (isRandomController(step)) return '随机控制器「' + (step.name || '控制器') + '」';
        if (isSimpleController(step)) return '简单控制器「' + (step.name || '控制器') + '」';
        if (isTransactionController(step)) return '事务控制器「' + (step.name || '控制器') + '」';
        if (isLoopController(step)) return '循环控制器「' + (step.name || '控制器') + '」';
        if (isBeanShellPost(step)) return 'BeanShell「' + (step.name || '处理器') + '」';
        if (isDebugSampler(step)) return 'Debug「' + (step.name || '采样器') + '」';
        if (isJsonPost(step)) return 'JSON提取「' + (step.name || '处理器') + '」';
        if (isRegexExtract(step)) return '正则提取「' + (step.name || '处理器') + '」';
        if (isXPathExtract(step)) return 'XPath提取「' + (step.name || '处理器') + '」';
        if (isJsr223Post(step)) return 'JSR223「' + (step.name || '处理器') + '」';
        if (isJdbcPost(step)) return 'JDBC「' + (step.name || '处理器') + '」';
        return step.name || step.label_zh || step.alias || '';
    }

    function yamlToCatalogStep(st, uidFn, recurse) {
        if (!st) return null;
        if (st.type === 'catalog_element') {
            var cat = {
                id: uidFn(),
                type: 'catalog_element',
                name: st.name || st.label_zh || st.alias || 'Catalog',
                enabled: st.enabled !== false,
                alias: st.alias || '',
                testclass: st.testclass || st.alias || '',
                guiclass: st.guiclass || '',
                jmeter_class: st.jmeter_class || '',
                category: st.category || 'other',
                label_zh: st.label_zh || st.alias || '',
                container: !!st.container,
                scope: st.scope || 'core',
                jmx_fragment: st.jmx_fragment || ''
            };
            if (st.catalog_props && typeof st.catalog_props === 'object') cat.catalog_props = st.catalog_props;
            if (st.container) cat.children = recurse(st.children || []);
            if (Array.isArray(st.catalog_hash_children) && st.catalog_hash_children.length) {
                cat.catalog_hash_children = recurse(st.catalog_hash_children);
            }
            if (st.import_order != null) cat.import_order = st.import_order;
            return cat;
        }
        return null;
    }

    global.JmsCatalogStepCompat = {
        isCatalog: isCatalog,
        alias: alias,
        prop: prop,
        isController: isController,
        isIfController: isIfController,
        isRandomController: isRandomController,
        isSimpleController: isSimpleController,
        isTransactionController: isTransactionController,
        isLoopController: isLoopController,
        isLogicContainer: isLogicContainer,
        isHttpSampler: isHttpSampler,
        isBeanShellPost: isBeanShellPost,
        isDebugSampler: isDebugSampler,
        isJsonPost: isJsonPost,
        isRegexExtract: isRegexExtract,
        isXPathExtract: isXPathExtract,
        isJsr223Post: isJsr223Post,
        isJdbcPost: isJdbcPost,
        isAuxProcessor: isAuxProcessor,
        displayLabel: displayLabel,
        yamlToCatalogStep: yamlToCatalogStep
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_if_mount_save_helper.js ---- */
/**
 * If 控制器挂载区 · 保存辅助（隔离模块，供各弹窗复用）
 */
(function (global) {
    'use strict';

    function M() { return global.JmsIfMountModel; }

    function getIf(planId, tgId, ifStepId) {
        if (!M()) return null;
        var step = null;
        if (typeof M().findMountHostStep === 'function') {
            step = M().findMountHostStep(planId, tgId, ifStepId);
        } else if (typeof M().findLogicMountStep === 'function') {
            step = M().findLogicMountStep(planId, tgId, ifStepId);
        } else if (typeof M().findIfStep === 'function') {
            step = M().findIfStep(planId, tgId, ifStepId);
        }
        return step && typeof M().ensureMountFields === 'function' ? M().ensureMountFields(step) : step;
    }

    function markDirty(planId, tgId, ifStepId) {
        if (M() && typeof M().markDirty === 'function') M().markDirty(planId, tgId, ifStepId);
    }

    function parentIfId(modal) {
        return modal ? modal.getAttribute('data-if-mount-parent-id') : '';
    }

    function mountIfId(modal) {
        return modal ? modal.getAttribute('data-if-mount-if-step-id') : '';
    }

    function isIfMountCtx(modal) {
        return !!(parentIfId(modal) || mountIfId(modal));
    }

    function uid() {
        return 'step_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    }

    function appendIfChild(ifStep, data) {
        if (!ifStep) return null;
        if (!Array.isArray(ifStep.children)) ifStep.children = [];
        var ns = Object.assign({ id: uid(), children: [] }, data || {});
        if (!Array.isArray(ns.children)) ns.children = [];
        ifStep.children.push(ns);
        notifyMountAdded(ifStep, 'ifchild:' + ns.id);
        return ns;
    }

    function clearIfMountAttrs(modal) {
        if (!modal) return;
        modal.removeAttribute('data-if-mount-parent-id');
        modal.removeAttribute('data-if-mount-if-step-id');
        modal.removeAttribute('data-if-mount-aux-create');
    }

    function notifyMountAdded(ifStep, key) {
        var TL = global.JmsIfMountTimeline;
        if (TL && typeof TL.assignAppendMountKey === 'function') {
            TL.assignAppendMountKey(ifStep, key);
        }
    }

    function bindIfMountProcessorEditModal(modal, planId, tgId, ifStepId, mode, procIndex, fallbackName) {
        if (!modal) return;
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.removeAttribute('data-step-id');
        modal.setAttribute('data-if-mount-if-step-id', ifStepId);
        modal.setAttribute('data-proc-mode', mode);
        if (mode === 'create') {
            if (fallbackName) modal.setAttribute('data-proc-default-name', fallbackName);
            modal.removeAttribute('data-proc-index');
        } else {
            modal.setAttribute('data-proc-index', String(procIndex));
            modal.removeAttribute('data-proc-default-name');
        }
    }

    function trySaveIfMountProcessor(modal, opts) {
        if (!modal || !opts) return false;
        var ifStepId = mountIfId(modal);
        if (!ifStepId) return false;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var mode = modal.getAttribute('data-proc-mode') || 'edit';
        var ifStep = getIf(planId, tgId, ifStepId);
        if (!ifStep) return true;
        if (!Array.isArray(ifStep.processors)) ifStep.processors = [];
        var list = ifStep.processors;
        var expectedType = opts.expectedType || '';
        if (mode === 'create') {
            if (typeof opts.validateCreate === 'function' && !opts.validateCreate()) return true;
            var fallback = modal.getAttribute('data-proc-default-name') || '';
            if (typeof opts.isEmptyCreate === 'function' && opts.isEmptyCreate(fallback)) {
                if (typeof opts.onClose === 'function') opts.onClose();
                return true;
            }
            if (typeof opts.validateRequired === 'function' && !opts.validateRequired()) return true;
            var created = typeof opts.defaultProcessor === 'function'
                ? opts.defaultProcessor(list.length)
                : { type: expectedType, enabled: true };
            opts.applyFields(created, opts.fields, fallback);
            list.push(created);
            notifyMountAdded(ifStep, 'ifproc:' + (list.length - 1));
        } else {
            var idx = parseInt(modal.getAttribute('data-proc-index'), 10);
            var existing = list[idx];
            if (!existing || (expectedType && existing.type !== expectedType)) return true;
            if (typeof opts.validateRequired === 'function' && !opts.validateRequired()) return true;
            opts.applyFields(existing, opts.fields, existing.name || fallbackNameFromModal(modal));
        }
        if (typeof opts.onClose === 'function') opts.onClose();
        markDirty(planId, tgId, ifStepId);
        return true;
    }

    function fallbackNameFromModal(modal) {
        return (modal && modal.getAttribute('data-proc-default-name')) || '';
    }

    global.JmsIfMountSaveHelper = {
        getIf: getIf,
        markDirty: markDirty,
        parentIfId: parentIfId,
        mountIfId: mountIfId,
        isIfMountCtx: isIfMountCtx,
        uid: uid,
        appendIfChild: appendIfChild,
        notifyMountAdded: notifyMountAdded,
        notifyChildAdded: function (ifStep, childId) { notifyMountAdded(ifStep, 'ifchild:' + childId); },
        clearIfMountAttrs: clearIfMountAttrs,
        bindIfMountProcessorEditModal: bindIfMountProcessorEditModal,
        trySaveIfMountProcessor: trySaveIfMountProcessor
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_if_mount_model.js ---- */
/**
 * If 控制器 · 挂载区数据模型（隔离模块 · 不影响 HTTP 步骤模型）
 */
(function (global) {
    'use strict';

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTgInPlan(plan, tgId) {
        if (!plan || !tgId) return null;
        var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
        return tg || null;
    }

    function findTg(planId, tgId) {
        var m = getModel();
        if (!m || !tgId) return null;
        var tg = (m.setup_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var plan = (m.test_plans || []).find(function (p) { return p.id === planId; });
        tg = findTgInPlan(plan, tgId);
        if (tg) return tg;
        tg = (m.post_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var i;
        for (i = 0; i < (m.test_plans || []).length; i++) {
            tg = findTgInPlan(m.test_plans[i], tgId);
            if (tg) return tg;
        }
        return null;
    }

    /** 与 jmeter_visual_builder.isLogicContainerStep 对齐（隔离副本，不依赖未导出 API） */
    function isCatalogContainerStepForMount(st) {
        return !!(st && st.type === 'catalog_element' && st.container);
    }

    function isLogicContainerStepForMount(st) {
        if (!st || !st.type) return false;
        return st.type === 'if_controller' ||
            st.type === 'random_controller' ||
            st.type === 'simple_controller' ||
            st.type === 'transaction_controller' ||
            st.type === 'loop_controller' ||
            isCatalogContainerStepForMount(st);
    }

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        var i;
        for (i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s) continue;
            if (s.id === stepId) return s;
            if (isLogicContainerStepForMount(s) && s.children) {
                var nested = findStepInList(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function isCatalogSamplerMountHost(step) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.isCatalogSamplerMountHost === 'function') {
            return global.JmsMountHostResolver.isCatalogSamplerMountHost(step);
        }
        if (!step || step.type !== 'catalog_element') return false;
        if (step.alias === 'DebugSampler') return true;
        return step.category === 'sampler' && !step.container;
    }

    function isLogicMountHost(step) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.isMountHostStep === 'function') {
            return global.JmsMountHostResolver.isMountHostStep(step);
        }
        return !!(step && (step.type === 'if_controller' || step.type === 'random_controller' || step.type === 'simple_controller' || step.type === 'transaction_controller' || step.type === 'loop_controller' || isCatalogSamplerMountHost(step)));
    }

    function findLogicMountStep(planId, tgId, stepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !stepId) return null;
        var step = findStepInList(tg.steps, stepId);
        return isLogicMountHost(step) ? step : null;
    }

    function findIfStep(planId, tgId, ifStepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !ifStepId) return null;
        var step = findStepInList(tg.steps, ifStepId);
        return step && step.type === 'if_controller' ? step : null;
    }

    function defaultConstantTimer() {
        return { enabled: false, name: '固定定时器', comments: '', delay_ms: 300 };
    }

    function defaultUserParameters() {
        return { enabled: false, per_iteration: false, params: [] };
    }

    function defaultStepListeners() {
        return { view_results_tree: false, aggregate_report: false, backend_listener: false };
    }

    function removeMountTimelineKey(ifStep, key) {
        if (!ifStep || !key || !Array.isArray(ifStep.mount_timeline_keys)) return;
        ifStep.mount_timeline_keys = ifStep.mount_timeline_keys.filter(function (k) { return k !== key; });
    }

    function isBlankConstantTimer(t) {
        if (!t || typeof t !== 'object') return true;
        if (t.enabled === false) return false;
        if (t.enabled === true) return false;
        if (String(t.comments || '').trim()) return false;
        if (String(t.name || '').trim() && t.name !== '固定定时器') return false;
        if (t.delay_ms != null && Number(t.delay_ms) !== 300) return false;
        return true;
    }

    function isBlankUserParameters(up) {
        if (!up || typeof up !== 'object') return true;
        if (up.enabled === true) return false;
        if (up.per_iteration === true) return false;
        if (String(up.name || '').trim()) return false;
        if (String(up.comments || '').trim()) return false;
        if (Array.isArray(up.params) && up.params.some(function (p) { return p && String(p.key || '').trim(); })) {
            return false;
        }
        return true;
    }

    function isConstantTimerVisible(ifStep) {
        return !!(ifStep && ifStep.constant_timer && !isBlankConstantTimer(ifStep.constant_timer));
    }

    function isUserParametersVisible(ifStep) {
        return !!(ifStep && ifStep.user_parameters && !isBlankUserParameters(ifStep.user_parameters));
    }

    function pruneBlankMountSlots(ifStep) {
        if (!ifStep) return;
        if (isBlankConstantTimer(ifStep.constant_timer)) {
            delete ifStep.constant_timer;
            removeMountTimelineKey(ifStep, 'iftimer:constant');
        }
        if (isBlankUserParameters(ifStep.user_parameters)) {
            delete ifStep.user_parameters;
            removeMountTimelineKey(ifStep, 'ifpre:user_parameters');
        }
    }

    function ensureMountFields(ifStep) {
        if (!ifStep) return null;
        if (!Array.isArray(ifStep.children)) ifStep.children = [];
        if (!Array.isArray(ifStep.processors)) ifStep.processors = [];
        if (!Array.isArray(ifStep.pre_processors)) ifStep.pre_processors = [];
        if (!Array.isArray(ifStep.assertions)) ifStep.assertions = [];
        if (!Array.isArray(ifStep.http_managers)) ifStep.http_managers = [];
        if (!Array.isArray(ifStep.step_listener_items)) ifStep.step_listener_items = [];
        if (!ifStep.step_listeners) ifStep.step_listeners = defaultStepListeners();
        if (!Array.isArray(ifStep.mount_timeline_keys)) ifStep.mount_timeline_keys = [];
        pruneBlankMountSlots(ifStep);
        return ifStep;
    }

    function markDirty(planId, tgId, ifStepId) {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        if (global.JmsTgIfMountRefresh &&
            typeof global.JmsTgIfMountRefresh.markDirtyAndRefresh === 'function') {
            global.JmsTgIfMountRefresh.markDirtyAndRefresh(planId, tgId, ifStepId);
            return;
        }
        if (vb && typeof vb.scheduleRender === 'function') vb.scheduleRender();
    }

    function findMountHostStep(planId, tgId, stepId) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.findMountHostStep === 'function') {
            return global.JmsMountHostResolver.findMountHostStep(getModel(), planId, tgId, stepId);
        }
        return findLogicMountStep(planId, tgId, stepId);
    }

    global.JmsIfMountModel = {
        findTg: findTg,
        isCatalogSamplerMountHost: isCatalogSamplerMountHost,
        isLogicMountHost: isLogicMountHost,
        findMountHostStep: findMountHostStep,
        findLogicMountStep: findLogicMountStep,
        findIfStep: findIfStep,
        findStepInList: findStepInList,
        ensureMountFields: ensureMountFields,
        isConstantTimerVisible: isConstantTimerVisible,
        isUserParametersVisible: isUserParametersVisible,
        isBlankConstantTimer: isBlankConstantTimer,
        isBlankUserParameters: isBlankUserParameters,
        defaultConstantTimer: defaultConstantTimer,
        defaultUserParameters: defaultUserParameters,
        defaultStepListeners: defaultStepListeners,
        markDirty: markDirty
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_if_mount_timeline.js ---- */
/**
 * If 控制器挂载区 · 统一时间线（隔离模块，不影响 TG/HTTP 挂载 timeline）
 */
(function (global) {
    'use strict';

    function assertLabel(type) {
        if (type === 'response' || type === 'response_assert') return '响应断言';
        if (type === 'json' || type === 'json_assert') return 'JSON断言';
        if (type === 'size' || type === 'size_assert') return '大小断言';
        if (type === 'md5hex' || type === 'md5hex_assert') return 'MD5Hex断言';
        return type || '断言';
    }

    function configLabel(type) {
        var cat = global.JmsTgConfigCatalog;
        if (cat && cat.LABELS && cat.LABELS[type]) return cat.LABELS[type];
        return type || '配置元件';
    }

    function truncate(s, n) {
        s = String(s || '');
        return s.length <= n ? s : s.slice(0, n) + '…';
    }

    function isLogicMountHost(ifStep) {
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isLogicMountHost === 'function') {
            return global.JmsIfMountModel.isLogicMountHost(ifStep);
        }
        return !!(ifStep && (ifStep.type === 'if_controller' || ifStep.type === 'random_controller' || ifStep.type === 'simple_controller' || ifStep.type === 'transaction_controller' || ifStep.type === 'loop_controller'));
    }

    function keys(ifStep) {
        return Array.isArray(ifStep && ifStep.mount_timeline_keys) ? ifStep.mount_timeline_keys : [];
    }

    function buildSlotOnlyEntries(ifStep, orderStart) {
        orderStart = orderStart || 0;
        var entries = [];
        var order = orderStart;
        var ifId = ifStep.id;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isUserParametersVisible === 'function'
            ? global.JmsIfMountModel.isUserParametersVisible(ifStep)
            : (ifStep.user_parameters && ifStep.user_parameters.enabled !== false)) {
            entries.push({
                kind: 'user_parameters', mountKind: 'user_parameters', mountIndex: 0, ifStepId: ifId,
                key: 'ifpre:user_parameters', defaultOrder: order++,
                icon: 'UP', typeLabel: '前置', name: '用户参数', meta: '',
                cardClass: 'jms-aux-card--preproc',
                disabled: ifStep.user_parameters.enabled === false
            });
        }
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isConstantTimerVisible === 'function'
            ? global.JmsIfMountModel.isConstantTimerVisible(ifStep)
            : (ifStep.constant_timer && ifStep.constant_timer.enabled !== false)) {
            var t = ifStep.constant_timer;
            entries.push({
                kind: 'timer', mountKind: 'timer', mountIndex: 0, ifStepId: ifId,
                key: 'iftimer:constant', defaultOrder: order++,
                icon: 'T', typeLabel: '定时器', name: t.name || '固定定时器',
                meta: (t.delay_ms != null ? t.delay_ms + 'ms' : ''), cardClass: 'jms-aux-card--timer',
                disabled: t.enabled === false
            });
        }
        return entries;
    }

    function buildDefaultEntries(ifStep) {
        var B = global.JmsMountCatalogBridge;
        if (B && typeof B.buildHashMountEntries === 'function') {
            if (typeof B.migrateLegacyMountArraysToHash === 'function') {
                B.migrateLegacyMountArraysToHash(ifStep);
            }
            var hashEntries = B.buildHashMountEntries(ifStep);
            if (hashEntries.length || (typeof B.usesHashForArrayMounts === 'function' && B.usesHashForArrayMounts(ifStep))) {
                var slotOnly = buildSlotOnlyEntries(ifStep, hashEntries.length);
                return hashEntries.concat(slotOnly);
            }
        }
        var entries = [];
        var order = 0;
        var ifId = ifStep.id;

        (ifStep.processors || []).forEach(function (p, i) {
            if (!p) return;
            var hint = '';
            if (p.type === 'json_post' && p.var) hint = p.var;
            if (p.type === 'regex_extract' && p.refname) hint = p.refname;
            entries.push({
                kind: 'processor', mountKind: 'processor', mountIndex: i, ifStepId: ifId,
                key: 'ifproc:' + i, defaultOrder: order++,
                icon: 'P', typeLabel: '后置', name: p.name || ('处理器 ' + (i + 1)), meta: hint || p.type,
                cardClass: 'jms-aux-card--json',
                disabled: p.enabled === false
            });
        });

        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isUserParametersVisible === 'function'
            ? global.JmsIfMountModel.isUserParametersVisible(ifStep)
            : (ifStep.user_parameters && ifStep.user_parameters.enabled !== false)) {
            entries.push({
                kind: 'user_parameters', mountKind: 'user_parameters', mountIndex: 0, ifStepId: ifId,
                key: 'ifpre:user_parameters', defaultOrder: order++,
                icon: 'UP', typeLabel: '前置', name: '用户参数', meta: '',
                cardClass: 'jms-aux-card--preproc',
                disabled: ifStep.user_parameters.enabled === false
            });
        }

        (ifStep.pre_processors || []).forEach(function (p, i) {
            if (!p) return;
            entries.push({
                kind: 'pre_processor', mountKind: 'pre_processor', mountIndex: i, ifStepId: ifId,
                key: 'ifpre:' + i, defaultOrder: order++,
                icon: 'BS', typeLabel: '前置', name: p.name || ('PreProcessor ' + (i + 1)),
                meta: truncate(p.script, 32), cardClass: 'jms-aux-card--beanshell',
                disabled: p.enabled === false
            });
        });

        (ifStep.assertions || []).forEach(function (a, i) {
            if (!a) return;
            entries.push({
                kind: 'assertion', mountKind: 'assertion', mountIndex: i, ifStepId: ifId,
                key: 'ifas:' + i, defaultOrder: order++,
                icon: 'A', typeLabel: '断言', name: a.name || assertLabel(a.type), meta: a.type,
                cardClass: 'jms-aux-card--assert'
            });
        });

        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isConstantTimerVisible === 'function'
            ? global.JmsIfMountModel.isConstantTimerVisible(ifStep)
            : (ifStep.constant_timer && ifStep.constant_timer.enabled !== false)) {
            var t = ifStep.constant_timer;
            entries.push({
                kind: 'timer', mountKind: 'timer', mountIndex: 0, ifStepId: ifId,
                key: 'iftimer:constant', defaultOrder: order++,
                icon: 'T', typeLabel: '定时器', name: t.name || '固定定时器',
                meta: (t.delay_ms != null ? t.delay_ms + 'ms' : ''), cardClass: 'jms-aux-card--timer',
                disabled: t.enabled === false
            });
        }

        (ifStep.http_managers || []).forEach(function (c, i) {
            if (!c) return;
            var cfgCardClass = 'jms-aux-card--config';
            if (c.type === 'counter') cfgCardClass += ' jms-aux-card--http-mount-config-counter';
            entries.push({
                kind: 'config', mountKind: 'config', mountIndex: i, ifStepId: ifId,
                key: 'ifcfg:' + i, defaultOrder: order++,
                icon: 'C', typeLabel: '配置', name: c.name || configLabel(c.type), meta: c.type,
                cardClass: cfgCardClass,
                disabled: c.enabled === false
            });
        });

        var sl = ifStep.step_listeners || {};
        [['view_results_tree', '察看结果树'], ['aggregate_report', '聚合报告'], ['backend_listener', '后端监听器']].forEach(function (pair, i) {
            if (!sl[pair[0]]) return;
            entries.push({
                kind: 'listener', mountKind: 'listener', mountIndex: i, mountListenerKey: pair[0], ifStepId: ifId,
                key: 'iflis:' + pair[0], defaultOrder: order++,
                icon: 'L', typeLabel: '监听器', name: pair[1], meta: '',
                cardClass: 'jms-aux-card--listener',
                disabled: (function(){ var lc=ifStep[pair[0]]; return lc&&typeof lc==='object'&&lc.enabled===false; })()
            });
        });

        return entries;
    }

    function sortEntriesByKeys(entries, keyList) {
        if (!keyList || !keyList.length) {
            entries.sort(function (a, b) { return a.defaultOrder - b.defaultOrder; });
            return entries;
        }
        var rank = {};
        keyList.forEach(function (k, i) { rank[k] = i; });
        entries.sort(function (a, b) {
            var ra = rank[a.key];
            var rb = rank[b.key];
            if (ra == null && rb == null) return a.defaultOrder - b.defaultOrder;
            if (ra == null) return 1;
            if (rb == null) return -1;
            return ra - rb;
        });
        return entries;
    }


    function keyChild(stepId) { return 'ifchild:' + stepId; }

    function ensureBodyTimelineKeys(ifStep) {
        if (!ifStep || !isLogicMountHost(ifStep)) return;
        if (!Array.isArray(ifStep.mount_timeline_keys)) ifStep.mount_timeline_keys = [];
        if (ifStep.mount_timeline_keys.length) return;
        var ordered = [];
        buildDefaultEntries(ifStep).forEach(function (e) { ordered.push(e.key); });
        (ifStep.children || []).forEach(function (c) {
            if (c && c.id) ordered.push(keyChild(c.id));
        });
        if (ordered.length) ifStep.mount_timeline_keys = ordered;
    }

    function buildBodyRenderPlan(ifStep) {
        if (!ifStep || !isLogicMountHost(ifStep)) return [];
        ensureBodyTimelineKeys(ifStep);
        var mountEntries = buildDefaultEntries(ifStep);
        var mountByKey = {};
        mountEntries.forEach(function (e) { mountByKey[e.key] = e; });
        var childByKey = {};
        (ifStep.children || []).forEach(function (c) {
            if (c && c.id) childByKey[keyChild(c.id)] = c;
        });
        var plan = [];
        var seenMount = {};
        var seenChild = {};
        keys(ifStep).forEach(function (key) {
            if (key.indexOf('ifchild:') === 0) {
                var ch = childByKey[key];
                if (ch) {
                    plan.push({ kind: 'child', step: ch, key: key });
                    seenChild[key] = true;
                }
            } else if (mountByKey[key]) {
                plan.push({ kind: 'mount', entry: mountByKey[key], key: key });
                seenMount[key] = true;
            }
        });
        mountEntries.forEach(function (e) {
            if (!seenMount[e.key]) plan.push({ kind: 'mount', entry: e, key: e.key });
        });
        (ifStep.children || []).forEach(function (c) {
            if (!c || !c.id) return;
            var ck = keyChild(c.id);
            if (!seenChild[ck]) plan.push({ kind: 'child', step: c, key: ck });
        });
        return plan;
    }


    function syncChildrenOrderFromKeys(ifStep, keyList) {
        if (!ifStep || !Array.isArray(ifStep.children)) return;
        var childKeys = (keyList || []).filter(function (k) { return k.indexOf('ifchild:') === 0; });
        var idOrder = childKeys.map(function (k) { return k.slice(8); });
        var byId = {};
        (ifStep.children || []).forEach(function (c) {
            if (c && c.id) byId[c.id] = c;
        });
        var reordered = [];
        idOrder.forEach(function (id) {
            if (byId[id]) {
                reordered.push(byId[id]);
                delete byId[id];
            }
        });
        Object.keys(byId).forEach(function (id) { reordered.push(byId[id]); });
        ifStep.children = reordered;
    }

    function buildBodyKeyList(ifStep) {
        return buildBodyRenderPlan(ifStep).map(function (p) { return p.key; });
    }

    function reorderBodyKeys(ifStep, fromIndex, toIndex) {
        if (!ifStep || !isLogicMountHost(ifStep) || fromIndex === toIndex) return false;
        ensureBodyTimelineKeys(ifStep);
        var keyList = buildBodyKeyList(ifStep);
        if (fromIndex < 0 || fromIndex >= keyList.length) return false;
        toIndex = Math.max(0, Math.min(toIndex, keyList.length - 1));
        if (fromIndex === toIndex) return true;
        var moved = keyList.splice(fromIndex, 1)[0];
        keyList.splice(toIndex, 0, moved);
        ifStep.mount_timeline_keys = keyList;
        syncChildrenOrderFromKeys(ifStep, keyList);
        return true;
    }

    function ensureMountTimelineKeys(ifStep) {
        ensureBodyTimelineKeys(ifStep);
    }

    function buildMountEntries(ifStep) {
        if (!ifStep || !isLogicMountHost(ifStep)) return [];
        ensureMountTimelineKeys(ifStep);
        var entries = buildDefaultEntries(ifStep);
        return sortEntriesByKeys(entries, keys(ifStep));
    }

    function assignAppendMountKey(ifStep, key) {
        if (!ifStep || !key) return;
        if (!Array.isArray(ifStep.mount_timeline_keys)) ifStep.mount_timeline_keys = [];
        if (ifStep.mount_timeline_keys.indexOf(key) < 0) {
            ifStep.mount_timeline_keys.push(key);
        }
    }


    function mountKeyPrefix(k) {
        if (k.indexOf("ifhash:") === 0) return "ifhash";
        if (k === "ifpre:user_parameters") return "ifpre:user_parameters";
        if (k.indexOf("ifpre:") === 0) return "ifpre";
        if (k.indexOf("ifas:") === 0) return "ifas";
        if (k.indexOf("ifcfg:") === 0) return "ifcfg";
        if (k.indexOf("ifproc:") === 0) return "ifproc";
        if (k.indexOf("iflis:") === 0) return "iflis";
        if (k.indexOf("iftimer:") === 0) return "iftimer";
        return "other";
    }

    function freshKeysForPrefix(freshEntries, prefix) {
        return freshEntries.filter(function (e) {
            return mountKeyPrefix(e.key) === prefix;
        }).map(function (e) { return e.key; });
    }

    function removeMountKeyFromTimeline(ifStep, key) {
        if (!ifStep || !key || !Array.isArray(ifStep.mount_timeline_keys)) return;
        var idx = ifStep.mount_timeline_keys.indexOf(key);
        if (idx >= 0) ifStep.mount_timeline_keys.splice(idx, 1);
    }

    function reconcileMountKeysAfterDelete(ifStep) {
        if (!ifStep) return;
        var oldKeys = ifStep.mount_timeline_keys || [];
        var childKeys = [];
        var oldMountKeys = [];
        oldKeys.forEach(function (k) {
            if (k.indexOf("ifchild:") === 0) childKeys.push(k);
            else oldMountKeys.push(k);
        });
        var freshEntries = buildDefaultEntries(ifStep);
        var freshByKey = {};
        freshEntries.forEach(function (e) { freshByKey[e.key] = e; });
        var usedFresh = {};
        var newMountKeys = [];
        oldMountKeys.forEach(function (oldKey) {
            if (freshByKey[oldKey]) {
                newMountKeys.push(oldKey);
                usedFresh[oldKey] = true;
                return;
            }
            var prefix = mountKeyPrefix(oldKey);
            if (prefix === "ifhash" || prefix === "ifpre" || prefix === "ifas" || prefix === "ifcfg" || prefix === "ifproc") {
                var pool = freshKeysForPrefix(freshEntries, prefix);
                var oldSamePrefix = oldMountKeys.filter(function (k) { return mountKeyPrefix(k) === prefix; });
                var pos = oldSamePrefix.indexOf(oldKey);
                if (pos >= 0 && pos < pool.length) {
                    var candidate = pool[pos];
                    if (candidate && !usedFresh[candidate] && freshByKey[candidate]) {
                        newMountKeys.push(candidate);
                        usedFresh[candidate] = true;
                    }
                }
            }
        });
        freshEntries.forEach(function (e) {
            if (!usedFresh[e.key]) {
                newMountKeys.push(e.key);
                usedFresh[e.key] = true;
            }
        });
        ifStep.mount_timeline_keys = newMountKeys.concat(childKeys);
    }

    function keyProcessor(index) { return 'ifproc:' + index; }
    function keyPreProcessor(index) { return 'ifpre:' + index; }
    function keyUserParameters() { return 'ifpre:user_parameters'; }
    function keyAssertion(index) { return 'ifas:' + index; }
    function keyTimer() { return 'iftimer:constant'; }
    function keyConfig(index) { return 'ifcfg:' + index; }
    function keyListener(listenerKey) { return 'iflis:' + listenerKey; }

    global.JmsIfMountTimeline = {
        buildMountEntries: buildMountEntries,
        buildBodyRenderPlan: buildBodyRenderPlan,
        ensureBodyTimelineKeys: ensureBodyTimelineKeys,
        ensureMountTimelineKeys: ensureMountTimelineKeys,
        keyChild: keyChild,
        assignAppendMountKey: assignAppendMountKey,
        keyProcessor: keyProcessor,
        keyPreProcessor: keyPreProcessor,
        keyUserParameters: keyUserParameters,
        keyAssertion: keyAssertion,
        keyTimer: keyTimer,
        keyConfig: keyConfig,
        keyListener: keyListener,
        reorderBodyKeys: reorderBodyKeys,
        buildBodyKeyList: buildBodyKeyList,
        removeMountKeyFromTimeline: removeMountKeyFromTimeline,
        reconcileMountKeysAfterDelete: reconcileMountKeysAfterDelete
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_if_mount_tree_rows.js ---- */
/**
 * If 控制器 · 挂载元件树形行（独立模块，仅展示非空项，对齐 HTTP/辅助步骤样式）
 */
(function (global) {
    'use strict';

    var Model = function () { return global.JmsIfMountModel; };

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function truncate(s, n) {
        s = String(s || '');
        return s.length <= n ? s : s.slice(0, n) + '…';
    }

    function ensureIf(step) {
        return Model() && typeof Model().ensureMountFields === 'function'
            ? Model().ensureMountFields(step)
            : step;
    }

    function isLogicMountHostStep(step) {
        if (Model() && typeof Model().isLogicMountHost === 'function') {
            return Model().isLogicMountHost(step);
        }
        return !!(step && (step.type === 'if_controller' || step.type === 'random_controller' || step.type === 'simple_controller' || step.type === 'transaction_controller' || step.type === 'loop_controller'));
    }

    function hostDomFor(step) {
        if (!step || !step.type) return null;
        if (step.type === 'if_controller') {
            return { card: 'jms-if-card', body: 'jms-if-card__body', node: 'if', empty: 'jms-if-card__empty', badge: 'jms-if-card__child-count' };
        }
        if (step.type === 'random_controller') {
            return { card: 'jms-random-card', body: 'jms-random-card__body', node: 'random', empty: 'jms-random-card__empty', badge: 'jms-random-card__child-count' };
        }
        if (step.type === 'simple_controller') {
            return { card: 'jms-simple-card', body: 'jms-simple-card__body', node: 'simple', empty: 'jms-simple-card__empty', badge: 'jms-simple-card__child-count' };
        }
        if (step.type === 'transaction_controller') {
            return { card: 'jms-transaction-card', body: 'jms-transaction-card__body', node: 'transaction', empty: 'jms-transaction-card__empty', badge: 'jms-transaction-card__child-count' };
        }
        if (step.type === 'loop_controller') {
            return { card: 'jms-loop-card', body: 'jms-loop-card__body', node: 'loop', empty: 'jms-loop-card__empty', badge: 'jms-loop-card__child-count' };
        }
        if (Model() && typeof Model().isCatalogSamplerMountHost === 'function' && Model().isCatalogSamplerMountHost(step)) {
            return { card: 'jms-catalog-card', body: 'jms-catalog-card__body', node: 'catalog-sampler', empty: 'jms-catalog-card__empty', badge: 'jms-catalog-card__child-count' };
        }
        if (step && step.type === 'catalog_element' && step.container) {
            return { card: 'jms-catalog-card', body: 'jms-catalog-card__body', node: 'catalog', empty: 'jms-catalog-card__empty', badge: 'jms-catalog-card__child-count' };
        }
        return null;
    }

    function findHostCard(stepsEl, step) {
        var dom = hostDomFor(step);
        if (!stepsEl || !step || !step.id || !dom) return null;
        return stepsEl.querySelector('.' + dom.card + '[data-step-id="' + step.id + '"]');
    }

    function findHostBody(hostCard, step) {
        var dom = hostDomFor(step);
        if (!hostCard || !dom) return null;
        return hostCard.querySelector('.' + dom.body + '.jms-tree-if-children');
    }

    function renderIfMountDragHandle(planId, tgId, ifStepId, bodyKey) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle jms-if-mount-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-if-step-id="' + esc(ifStepId) + '" data-if-body-key="' + esc(bodyKey) + '">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function resolveMountEnableToggle(planId, tgId, ifStepId, opts) {
        var L = global.JmsLogicCtrlEnableUi;
        if (!L || typeof L.renderIfMountToggle !== 'function') return '';
        var ifStep = null;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.findLogicMountStep === 'function') {
            ifStep = global.JmsIfMountModel.findLogicMountStep(planId, tgId, ifStepId);
        } else if (global.JmsIfMountModel && typeof global.JmsIfMountModel.findIfStep === 'function') {
            ifStep = global.JmsIfMountModel.findIfStep(planId, tgId, ifStepId);
        }
        if (ifStep && global.JmsIfMountModel && typeof global.JmsIfMountModel.ensureMountFields === 'function') {
            ifStep = global.JmsIfMountModel.ensureMountFields(ifStep);
        }
        if (!ifStep) return '';
        var kind = opts.mountKind;
        var enabled = true;
        if (kind === 'timer' && ifStep.constant_timer) {
            enabled = ifStep.constant_timer.enabled !== false;
        } else if (kind === 'user_parameters' && ifStep.user_parameters) {
            enabled = ifStep.user_parameters.enabled !== false;
        } else if (kind === 'catalog_hash') {
            var hashChild = (ifStep.catalog_hash_children || [])[opts.mountIndex];
            enabled = hashChild ? hashChild.enabled !== false : true;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, hashChild && hashChild.alias ? hashChild.alias : '', enabled);
        } else if (kind === 'config') {
            var entry = (ifStep.http_managers || [])[opts.mountIndex];
            if (!entry) return '';
            enabled = entry.enabled !== false;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, entry.type, enabled);
        } else if (kind === 'processor') {
            var proc = (ifStep.processors || [])[opts.mountIndex];
            if (!proc) return '';
            enabled = proc.enabled !== false;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, '', enabled);
        } else if (kind === 'pre_processor') {
            var pre = (ifStep.pre_processors || [])[opts.mountIndex];
            if (!pre) return '';
            enabled = pre.enabled !== false;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, '', enabled);
        } else if (kind === 'assertion') {
            var A = global.JmsAssertEnableUi;
            var ast = (ifStep.assertions || [])[opts.mountIndex];
            if (!ast || !A || typeof A.renderIfMountAssertToggle !== 'function') return '';
            enabled = ast.enabled !== false;
            return A.renderIfMountAssertToggle(planId, tgId, ifStepId, opts.mountIndex, enabled);
        } else if (kind === 'listener') {
            var LEn = global.JmsListenerEnableUi;
            var lKey = opts.mountListenerKey || '';
            if (!lKey || !LEn || typeof LEn.renderIfMountListenerToggle !== 'function') return '';
            enabled = typeof LEn.isIfMountListenerActive === 'function' ? LEn.isIfMountListenerActive(ifStep, lKey) : true;
            return LEn.renderIfMountListenerToggle(planId, tgId, ifStepId, lKey, enabled);
        } else if (kind !== 'timer' && kind !== 'user_parameters') {
            return '';
        }
        return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex || 0, '', enabled);
    }

    function composeMountActions(planId, tgId, ifStepId, opts) {
        var menu = renderMountActionsMenu(opts);
        var toggle = resolveMountEnableToggle(planId, tgId, ifStepId, opts);
        if (!toggle) return menu;
        var L = global.JmsLogicCtrlEnableUi;
        return L && typeof L.composeCardToolbar === 'function'
            ? L.composeCardToolbar(toggle, menu)
            : menu;
    }

    function renderMountActionsMenu(opts) {
        var common = ' data-plan-id="' + esc(opts.planId) + '" data-tg-id="' + esc(opts.tgId) + '"' +
            ' data-if-step-id="' + esc(opts.ifStepId) + '" data-if-mount-kind="' + esc(opts.mountKind) + '"' +
            ' data-if-mount-index="' + esc(String(opts.mountIndex)) + '"' +
            ' data-if-body-key="' + esc(opts.bodyKey || '') + '"';
        var extra = '';
        if (opts.assertKind) extra += ' data-assert-kind="' + esc(opts.assertKind) + '"';
        if (opts.configType) extra += ' data-config-type="' + esc(opts.configType) + '"';
        if (opts.mountListenerKey) extra += ' data-listener-key="' + esc(opts.mountListenerKey) + '"';
        return '<div class="jms-http-card__actions lth-step-actions jms-if-mount-row-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="挂载元件操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost jms-if-mount-row-edit" role="menuitem"' + common + extra + '>编辑</button>' +
            '<button type="button" class="jms-btn-ghost jms-if-mount-row-del" role="menuitem"' + common + extra + '>删除</button>' +
            '</div></div>';
    }

    function renderMountRow(opts) {
        var depth = opts.depth || 0;
        var bodyKey = opts.bodyKey || '';
        var cardCls = 'jms-aux-card ' + (opts.cardClass || 'jms-aux-card--if-mount');
        if (opts.disabled) cardCls += ' is-disabled';
        return '<div class="jms-tree-node jms-tree-node--if-mount" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';"' +
            ' data-if-mount-kind="' + esc(opts.mountKind) + '" data-if-mount-index="' + esc(String(opts.mountIndex)) + '"' +
            ' data-if-step-id="' + esc(opts.ifStepId) + '" data-parent-step-id="' + esc(opts.parentStepId || '') + '"' +
            ' data-if-body-key="' + esc(bodyKey) + '">' +
            renderIfMountDragHandle(opts.planId, opts.tgId, opts.ifStepId, bodyKey) +
            '<div class="jms-tree-node__body jms-tree-node__body--if-mount">' +
            '<div class="' + cardCls + '" data-plan-id="' + esc(opts.planId) + '" data-tg-id="' + esc(opts.tgId) + '"' +
            ' data-if-step-id="' + esc(opts.ifStepId) + '" data-if-mount-kind="' + esc(opts.mountKind) + '"' +
            ' data-if-mount-index="' + esc(String(opts.mountIndex)) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">' + esc(opts.icon || '·') + '</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">' + esc(opts.typeLabel) + '</span>' +
            '<span class="jms-aux-name">' + esc(opts.name) + '</span>' +
            (opts.meta ? '<code class="jms-aux-meta hf-mono">' + esc(opts.meta) + '</code>' : '') +
            '</div>' +
            composeMountActions(opts.planId, opts.tgId, opts.ifStepId, opts) +
            '</div></div></div>';
    }

    function configLabel(type) {
        var cat = global.JmsTgConfigCatalog;
        if (cat && cat.LABELS && cat.LABELS[type]) return cat.LABELS[type];
        return type || '配置元件';
    }

    function assertLabel(type) {
        if (type === 'response') return '响应断言';
        if (type === 'json') return 'JSON断言';
        if (type === 'size') return '大小断言';
        if (type === 'md5hex') return 'MD5Hex断言';
        return type || '断言';
    }

    function hasMountItems(step) {
        step = ensureIf(step);
        if (!step) return false;
        if (global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.hasAnyHashMounts === 'function') {
            if (global.JmsMountCatalogBridge.hasAnyHashMounts(step)) return true;
        }
        if ((step.processors || []).length) return true;
        if ((step.pre_processors || []).length) return true;
        if ((step.assertions || []).length) return true;
        if ((step.http_managers || []).length) return true;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isConstantTimerVisible === 'function') {
            if (global.JmsIfMountModel.isConstantTimerVisible(step)) return true;
        } else if (step.constant_timer) return true;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isUserParametersVisible === 'function') {
            if (global.JmsIfMountModel.isUserParametersVisible(step)) return true;
        } else if (step.user_parameters) return true;
        var sl = step.step_listeners || {};
        return !!(sl.view_results_tree || sl.aggregate_report || sl.backend_listener);
    }


    function renderMountEntry(entry, planId, tgId, depth, parentStepId) {
        return renderMountRow({
            planId: planId,
            tgId: tgId,
            ifStepId: entry.ifStepId,
            parentStepId: parentStepId,
            depth: depth,
            mountKind: entry.mountKind,
            mountIndex: entry.mountIndex,
            mountListenerKey: entry.mountListenerKey,
            cardClass: entry.cardClass,
            icon: entry.icon,
            typeLabel: entry.typeLabel,
            name: entry.name,
            meta: entry.meta,
            bodyKey: entry.key || '',
            assertKind: entry.kind === 'assertion' ? (entry.meta || '') : '',
            configType: entry.kind === 'config' ? (entry.meta || '') : '',
            mountListenerKey: entry.mountListenerKey || '',
            disabled: !!entry.disabled
        });
    }

    function renderIfBodyContent(ifStep, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        if (!isLogicMountHostStep(ifStep)) return '';
        ifStep = ensureIf(ifStep);
        depth = depth || 0;
        parentStepId = parentStepId || ifStep.id;
        selectedHttpStepId = selectedHttpStepId || '';
        var TL = global.JmsIfMountTimeline;
        var R = global.JmsTgTreeRenderer;
        if (TL && typeof TL.buildBodyRenderPlan === 'function' && R && typeof R.renderChildStepNodes === 'function') {
            var plan = TL.buildBodyRenderPlan(ifStep);
            if (!plan.length) return '';
            var html = '';
            plan.forEach(function (item) {
                if (item.kind === 'mount' && item.entry) {
                    html += renderMountEntry(item.entry, planId, tgId, depth, parentStepId);
                } else if (item.kind === 'child' && item.step) {
                    html += R.renderChildStepNodes([item.step], planId, tgId, depth, parentStepId, selectedHttpStepId);
                }
            });
            return html;
        }
        var legacyMounts = renderRows(ifStep, planId, tgId, depth, parentStepId);
        var legacyChildren = R && typeof R.renderChildStepNodes === 'function'
            ? R.renderChildStepNodes(ifStep.children || [], planId, tgId, depth, parentStepId, selectedHttpStepId)
            : '';
        return legacyMounts + legacyChildren;
    }

    function renderRows(ifStep, planId, tgId, depth, parentStepId) {
        if (!isLogicMountHostStep(ifStep)) return '';
        ifStep = ensureIf(ifStep);
        depth = depth || 0;
        parentStepId = parentStepId || '';
        if (!hasMountItems(ifStep)) return '';

        var TL = global.JmsIfMountTimeline;
        var entries = TL && typeof TL.buildMountEntries === 'function'
            ? TL.buildMountEntries(ifStep)
            : [];
        if (!entries.length) return '';

        var html = '';
        entries.forEach(function (entry) {
            html += renderMountRow({
                planId: planId,
                tgId: tgId,
                ifStepId: entry.ifStepId || ifStep.id,
                parentStepId: parentStepId,
                depth: depth,
                mountKind: entry.mountKind,
                mountIndex: entry.mountIndex,
                mountListenerKey: entry.mountListenerKey,
                cardClass: entry.cardClass,
                icon: entry.icon,
                typeLabel: entry.typeLabel,
                name: entry.name,
                meta: entry.meta,
                bodyKey: entry.key || ''
            });
        });
        return html;
    }

    function syncIfBodyEmptyHint(body) {
        if (!body) return;
        var hasMounts = body.querySelector(':scope > .jms-tree-node--if-mount');
        var hasChildSteps = body.querySelector(':scope > .jms-tree-node:not(.jms-tree-node--if-mount)');
        var emptyHint = body.querySelector(':scope > .jms-empty-hint.jms-if-card__empty, :scope > .jms-if-card__empty, :scope > .jms-empty-hint.jms-random-card__empty, :scope > .jms-random-card__empty, :scope > .jms-empty-hint.jms-simple-card__empty, :scope > .jms-simple-card__empty, :scope > .jms-empty-hint.jms-transaction-card__empty, :scope > .jms-transaction-card__empty, :scope > .jms-empty-hint.jms-loop-card__empty, :scope > .jms-loop-card__empty');
        if (!hasMounts && !hasChildSteps) {
            if (!emptyHint) {
                var emptyCls = 'jms-if-card__empty';
                if (body.closest('.jms-random-card')) emptyCls = 'jms-random-card__empty';
                else if (body.closest('.jms-simple-card')) emptyCls = 'jms-simple-card__empty';
                else if (body.closest('.jms-transaction-card')) emptyCls = 'jms-transaction-card__empty';
                else if (body.closest('.jms-loop-card')) emptyCls = 'jms-loop-card__empty';
                body.insertAdjacentHTML('beforeend', '<p class="jms-empty-hint ' + emptyCls + '">暂无子步骤</p>');
            }
            return;
        }
        if (emptyHint && emptyHint.parentNode) emptyHint.parentNode.removeChild(emptyHint);
    }

    function resolveIfMountDepth(stepsEl, ifStepId, fallbackDepth) {
        if (!stepsEl || !ifStepId) return fallbackDepth || 1;
        var ifNode = stepsEl.querySelector('.jms-tree-node--if[data-step-id="' + ifStepId + '"], .jms-tree-node--random[data-step-id="' + ifStepId + '"], .jms-tree-node--simple[data-step-id="' + ifStepId + '"], .jms-tree-node--transaction[data-step-id="' + ifStepId + '"], .jms-tree-node--loop[data-step-id="' + ifStepId + '"], .jms-tree-node--catalog[data-step-id="' + ifStepId + '"]');
        if (!ifNode) return fallbackDepth || 1;
        return (parseInt(ifNode.getAttribute('data-depth') || '0', 10) || 0) + 1;
    }

    function patchIfBodyInDom(stepsEl, ifStep, planId, tgId, selectedHttpStepId) {
        if (!stepsEl || !ifStep || !ifStep.id || !isLogicMountHostStep(ifStep)) return false;
        ifStep = ensureIf(ifStep);
        var hostCard = findHostCard(stepsEl, ifStep);
        if (!hostCard) return false;
        var body = findHostBody(hostCard, ifStep);
        if (!body) return false;

        Array.prototype.slice.call(body.querySelectorAll(':scope > .jms-tree-node, :scope > .jms-empty-hint.jms-if-card__empty, :scope > .jms-if-card__empty, :scope > .jms-empty-hint.jms-random-card__empty, :scope > .jms-random-card__empty, :scope > .jms-empty-hint.jms-simple-card__empty, :scope > .jms-simple-card__empty, :scope > .jms-empty-hint.jms-transaction-card__empty, :scope > .jms-transaction-card__empty, :scope > .jms-empty-hint.jms-loop-card__empty, :scope > .jms-loop-card__empty')).forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });

        var depth = resolveIfMountDepth(stepsEl, ifStep.id, 1);
        var bodyHtml = renderIfBodyContent(ifStep, planId, tgId, depth, ifStep.id, selectedHttpStepId || '');
        if (bodyHtml) {
            body.insertAdjacentHTML('beforeend', bodyHtml);
        }
        syncIfBodyEmptyHint(body);
        var dom = hostDomFor(ifStep);
        var badge = dom ? hostCard.querySelector('.' + dom.badge + ', .jms-http-assert-badge') : null;
        if (badge && global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.countStepsInList === 'function') {
            badge.textContent = global.JmsTgTreeRenderer.countStepsInList(ifStep.children) + ' 子步骤';
        }
        return true;
    }

    function patchMountRowsInDom(stepsEl, ifStep, planId, tgId) {
        return patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
    }

    global.JmsTgIfMountTreeRows = {
        hasMountItems: hasMountItems,
        renderRows: renderRows,
        renderIfBodyContent: renderIfBodyContent,
        patchIfBodyInDom: patchIfBodyInDom,
        patchMountRowsInDom: patchMountRowsInDom,
        syncIfBodyEmptyHint: syncIfBodyEmptyHint
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_catalog_element_tree.js ---- */
/**
 * JMeter catalog · 树视图渲染 catalog_element（隔离模块）
 */
(function (global) {
    'use strict';

    var ALIAS_BADGE = {
        TransactionController: 'TXN',
        LoopController: 'LOOP',
        GenericController: 'SIM',
        SimpleController: 'SIM',
        RandomController: 'RND',
        IfController: 'IF',
        DebugSampler: 'DBG'
    };

    function esc(s) {
        if (global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.esc === 'function') {
            return global.JmsTgTreeRenderer.esc(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function renderDragHandle(planId, tgId, stepId, parentStepId) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-step-id="' + esc(stepId) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function countChildren(step) {
        var n = 0;
        (step.children || []).forEach(function (c) {
            if (!c) return;
            n += 1;
            if (c.children) n += countChildren(c);
        });
        return n;
    }

    function resolveBadge(step) {
        if (step.alias && ALIAS_BADGE[step.alias]) return ALIAS_BADGE[step.alias];
        return String(step.category || 'cat').slice(0, 3).toUpperCase();
    }


    function renderContainerBody(step, planId, tgId, depth, selectedHttpStepId) {
        var Rows = global.JmsTgIfMountTreeRows;
        var M = global.JmsIfMountModel;
        if (Rows && typeof Rows.renderIfBodyContent === 'function' &&
            M && typeof M.isLogicMountHost === 'function' && M.isLogicMountHost(step)) {
            var mixed = Rows.renderIfBodyContent(step, planId, tgId, (depth || 0) + 1, step.id, selectedHttpStepId || '');
            if (mixed) return mixed;
        }
        return renderChildren(step, planId, tgId, depth, selectedHttpStepId);
    }

    function renderChildren(step, planId, tgId, depth, selectedHttpStepId) {
        if (!global.JmsTgTreeRenderer || typeof global.JmsTgTreeRenderer.renderChildStepNodes !== 'function') {
            return '<p class="jms-empty-hint">暂无子步骤</p>';
        }
        var html = global.JmsTgTreeRenderer.renderChildStepNodes(
            step.children || [], planId, tgId, depth, step.id, selectedHttpStepId
        );
        return html || '<p class="jms-empty-hint jms-catalog-card__empty">暂无子步骤</p>';
    }

    function formatSummaryValue(field, val) {
        if (field.type === 'checkbox') return val ? '是' : '否';
        if (Array.isArray(val)) return val.join(', ');
        if (val == null || val === '') return '';
        return String(val);
    }

    function renderMetaText(step) {
        var props = step.catalog_props || {};
        if (step.alias === 'TransactionController') {
            var parts = [];
            if (props.generate_parent_sample) parts.push('生成父样本');
            if (props.include_timer_duration) parts.push('含定时器耗时');
            return parts.length ? parts.join(' · ') : '标准事务';
        }
        if (step.alias === 'LoopController') {
            if (props.loop_forever) return '永远';
            var loops = Number(props.loops);
            return (loops > 0 ? loops : 1) + ' 次';
        }
        if (step.alias === 'RandomController') {
            return props.ignore_sub_controller_blocks ? '忽略子控制器块' : '标准随机';
        }
        if (props.comments) return String(props.comments).slice(0, 36);
        return step.alias ? esc(step.alias) : '';
    }

    function renderLeafSummary(step) {
        var S = global.JmsCatalogElementEditorSchema;
        var props = step.catalog_props || (S && typeof S.defaultProps === 'function' ? S.defaultProps(step) : {});
        var schema = S && typeof S.getSchema === 'function' ? S.getSchema(step) : { fields: [] };
        var rows = (schema.fields || []).slice(0, 5).map(function (f) {
            var v = formatSummaryValue(f, props[f.key]);
            if (!v) return '';
            return '<div class="jms-catalog-card__summary-row">' +
                '<span class="jms-catalog-card__summary-label">' + esc(f.label) + '</span>' +
                '<span class="jms-catalog-card__summary-val">' + esc(v.length > 80 ? v.slice(0, 79) + '…' : v) + '</span></div>';
        }).filter(Boolean).join('');
        var comments = props.comments
            ? '<div class="jms-catalog-card__summary-comments">' + esc(props.comments) + '</div>' : '';
        if (rows || comments) return rows + comments;
        return '<p class="jms-empty-hint jms-catalog-card__empty">点击头部展开查看配置摘要</p>';
    }


function renderAuxMenuActions(planId, tgId, stepId, editClass, delClass) {
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + editClass + '" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog jms-tree-del" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(stepId) + '" role="menuitem">删除</button>' +
            '</div></div>';
    }

    function renderExpandableHeadToolbar(planId, tgId, step, editClass, delClass, childCount, childCountClass) {
        var actions = renderAuxMenuActions(planId, tgId, step.id, editClass, delClass);
        var E = global.JmsTgTreeStepEnableUnify;
        if (E && typeof E.renderStepToggle === 'function') {
            var toggle = E.renderStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle && typeof E.composeCardToolbar === 'function') {
                actions = E.composeCardToolbar(toggle, actions);
            }
        }
        var S = global.JmsTgTreeHeadBadgeSlots;
        if (S && typeof S.composeLogicHead === 'function') {
            return S.composeLogicHead(childCount, childCountClass, actions);
        }
        return '<div class="jms-card-head-actions">' + actions + '</div>';
    }

    function renderMountContextPanel(step, planId, tgId) {
        if (global.JmsCatalogMountContextUi && typeof global.JmsCatalogMountContextUi.renderPanel === 'function') {
            return global.JmsCatalogMountContextUi.renderPanel(step, planId, tgId);
        }
        return '';
    }


    function renderCatalogSamplerMountBody(step, planId, tgId, depth) {
        if (!step || !global.JmsTgIfMountTreeRows || typeof global.JmsTgIfMountTreeRows.renderRows !== 'function') return '';
        var M = global.JmsIfMountModel;
        if (M && typeof M.isLogicMountHost === 'function' && !M.isLogicMountHost(step)) return '';
        if (M && typeof M.ensureMountFields === 'function') step = M.ensureMountFields(step);
        depth = depth || 1;
        return global.JmsTgIfMountTreeRows.renderRows(step, planId, tgId, depth, step.id) || '';
    }

    function renderRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        if (!step || step.type !== 'catalog_element') return '';
        if (global.JmsTgCatalogElementNativeView && typeof global.JmsTgCatalogElementNativeView.renderRow === 'function') {
            var bridged = global.JmsTgCatalogElementNativeView.renderRow(
                step, planId, tgId, depth, parentStepId, selectedHttpStepId
            );
            if (bridged) return bridged;
        }
        depth = depth || 0;
        var childCount = countChildren(step);
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var MountUi = global.JmsCatalogMountContextUi;
        var isSamplerLeaf = MountUi && typeof MountUi.isCatalogSampler === 'function' && MountUi.isCatalogSampler(step);
        var container = !!step.container;
        var expandableCls = ' jms-catalog-card--expandable';
        var containerCls = container ? ' jms-catalog-card--container' : '';
        if (isSamplerLeaf) expandableCls = ' jms-catalog-card--expandable jms-catalog-card--sampler';
        var badge = esc(resolveBadge(step));
        var mountPanel = renderMountContextPanel(step, planId, tgId);
        var bodyInner = container
            ? renderContainerBody(step, planId, tgId, depth, selectedHttpStepId)
            : (isSamplerLeaf ? renderCatalogSamplerMountBody(step, planId, tgId, depth + 1) : renderLeafSummary(step));
        var metaText = renderMetaText(step);
        var catalogHeadActions = renderExpandableHeadToolbar(
            planId, tgId, step, 'jms-btn-edit-catalog', 'jms-btn-del-catalog',
            container ? childCount : 0,
            'jms-catalog-card__child-count'
        );
        return '<div class="jms-tree-node jms-tree-node--catalog" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';" data-step-id="' + esc(step.id) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            renderDragHandle(planId, tgId, step.id, parentStepId) +
            '<div class="jms-tree-node__body"><div class="jms-catalog-card' + expandableCls + containerCls + disabled + ' jms-catalog-card--collapsed" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" aria-expanded="false">' +
            '<div class="jms-catalog-card__head">' +
            '<span class="jms-catalog-badge">' + badge + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="jms-catalog-card__meta">' +
            (metaText ? '<span class="jms-catalog-card__meta-text">' + esc(metaText) + '</span>' : '') +
            '</span>' +
            catalogHeadActions +
            '</div>' +
            mountPanel +
            '<div class="jms-catalog-card__body' + (container ? ' jms-tree-if-children' : ' jms-catalog-card__body--summary') + '">' + bodyInner + '</div>' +
            '</div></div></div>';
    }

    global.JmsTgCatalogElementTree = {
        renderRow: renderRow
    };
})(window);

/* ---- js/jms_studio_catalog_bridge_v2.js ---- */
/**
 * JMeter Studio V2 · catalog 添加桥接（统一 catalog_element 弹窗，仅 HTTP 请求走原生）
 */
(function (global) {
    'use strict';

    var SAMPLER_ALIAS_HTTP = { HTTPSamplerProxy: 1, HTTPSampler: 1, HTTPSampler2: 1 };

    var HTTP_MOUNT_ALLOWED = {
        listener: {
            ViewResultsFullVisualizer: 1,
            ResultCollector: 1,
            StatVisualizer: 1,
            SummaryReport: 1,
            BackendListener: 1
        },
        controller: { IfController: 1 }
    };

    function toast(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error' });
        }
    }

    function isAllowedForMount(comp, ctx, category) {
        if (!comp) return false;
        if (ctx.httpMount && category && HTTP_MOUNT_ALLOWED[category]) {
            return !!HTTP_MOUNT_ALLOWED[category][comp.alias];
        }
        if (global.JmsHierarchyRules && typeof global.JmsHierarchyRules.componentAllowed === 'function') {
            return global.JmsHierarchyRules.componentAllowed(comp, ctx.context);
        }
        return true;
    }

    function allowed(comp, ctx) {
        return isAllowedForMount(comp, ctx, comp.category);
    }

    function legacyCtx(ctx) {
        var out = Object.assign({}, ctx);
        if (out.context === 'sampler_child') out.context = 'sampler';
        return out;
    }

    function catalogTemplatesFromState(state) {
        return (state && state.templates) || {};
    }

    function appendCatalogFallback(comp, ctx, state) {
        var Bridge = global.JmsStudioCatalogBridge;
        var vb = global.JmsVisualBuilder;
        if (!Bridge || !vb) return { ok: false };
        var st = Object.assign({}, state || {});
        if (!st.templates) st.templates = catalogTemplatesFromState(st);
        var legacy = legacyCtx(ctx);
        if (typeof Bridge.appendCatalogElement === 'function') {
            var direct = Bridge.appendCatalogElement(vb, comp, legacy, st);
            if (direct && (direct.ok || direct.error)) return direct;
        }
        if (typeof Bridge.addCatalogComponent === 'function') {
            return Bridge.addCatalogComponent(comp, legacy, st);
        }
        return { ok: false };
    }

    function addComponent(comp, ctx, state) {
        var vb = global.JmsVisualBuilder;
        if (!vb || !comp) return { ok: false };
        if (!isAllowedForMount(comp, ctx, comp.category)) {
            toast('当前层级不可添加：' + (comp.label_zh || comp.alias), false);
            return { ok: false, error: 'not_allowed' };
        }

        if (comp.category === 'sampler' && SAMPLER_ALIAS_HTTP[comp.alias]) {
            return appendCatalogFallback(comp, ctx, state || {});
        }

        var res = appendCatalogFallback(comp, ctx, state || {});
        if (res && res.ok) {
            if (!(res.pending || res.mode === 'pending_create')) {
                toast('已添加：' + (comp.label_zh || comp.alias), true);
            }
            return res;
        }

        toast('添加失败：' + (comp.label_zh || comp.alias), false);
        return { ok: false, error: (res && res.error) || 'append_failed' };
    }

    global.JmsStudioCatalogBridgeV2 = {
        addComponent: addComponent,
        allowed: allowed,
        isAllowedForMount: isAllowedForMount
    };
})(window);

/* ---- js/jms_catalog_sampler_children.js ---- */
/**
 * JMeter catalog · 取样器 hashTree 子元件（catalog_hash_children，隔离模块）
 */
(function (global) {
    'use strict';

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === String(stepId)) return s;
            if (Array.isArray(s.children)) {
                var n = findStepInList(s.children, stepId);
                if (n) return n;
            }
        }
        return null;
    }

    function isSamplerStep(step) {
        if (!step) return false;
        if (step.method && !step.type) return true;
        if (step.type === 'debug_sampler') return true;
        return step.type === 'catalog_element' && step.category === 'sampler';
    }

    function findPlan(model, planId) {
        return (model.test_plans || []).filter(function (p) { return p && p.id === planId; })[0];
    }

    function findTg(plan, tgId, model) {
        var tg = (plan.thread_groups || []).filter(function (t) { return t && t.id === tgId; })[0];
        if (tg) return tg;
        tg = (model.setup_thread_groups || []).filter(function (t) { return t && t.id === tgId; })[0];
        if (tg) return tg;
        return (model.post_thread_groups || []).filter(function (t) { return t && t.id === tgId; })[0];
    }

    function findSamplerStep(model, planId, tgId, stepId) {
        var plan = findPlan(model, planId);
        var tg = plan && findTg(plan, tgId, model);
        if (!tg || !stepId) return null;
        var step = findStepInList(tg.steps, stepId);
        return step && isSamplerStep(step) ? step : null;
    }

    function ensureChildren(step) {
        if (!step.catalog_hash_children) step.catalog_hash_children = [];
        return step.catalog_hash_children;
    }

    function findMountHostStep(model, planId, tgId, stepId) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.findMountHostStep === 'function') {
            return global.JmsMountHostResolver.findMountHostStep(model, planId, tgId, stepId);
        }
        return findSamplerStep(model, planId, tgId, stepId);
    }

    function appendUnderMountHost(vb, planId, tgId, hostStepId, stepData) {
        if (!vb || typeof vb.getModel !== 'function' || !stepData) return null;
        if (typeof vb.readModelFromDom === 'function') vb.readModelFromDom();
        var model = vb.getModel();
        var step = findMountHostStep(model, planId, tgId, hostStepId);
        if (!step) return null;
        var list = ensureChildren(step);
        var item = Object.assign({ id: stepData.id || ('cat_' + Math.random().toString(36).slice(2, 10)) }, stepData);
        if (item.container && !Array.isArray(item.children)) item.children = [];
        list.push(item);
        if (typeof vb.notifyUserEdit === 'function') vb.notifyUserEdit();
        return item;
    }

    function appendUnderSampler(vb, planId, tgId, samplerStepId, stepData) {
        return appendUnderMountHost(vb, planId, tgId, samplerStepId, stepData);
    }

    function catalogChildToYaml(item) {
        if (!item || item.type !== 'catalog_element') return null;
        var out = {
            type: 'catalog_element',
            name: item.name || item.alias,
            alias: item.alias,
            enabled: item.enabled !== false
        };
        if (item.testclass) out.testclass = item.testclass;
        if (item.guiclass) out.guiclass = item.guiclass;
        if (item.jmeter_class) out.jmeter_class = item.jmeter_class;
        if (item.category) out.category = item.category;
        if (item.label_zh) out.label_zh = item.label_zh;
        if (item.container) out.container = true;
        if (item.jmx_fragment) out.jmx_fragment = item.jmx_fragment;
        if (item.catalog_props && typeof item.catalog_props === 'object') {
            var props = Object.assign({}, item.catalog_props);
            var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
            if (HN && item.alias === 'HeaderManager' && typeof HN.normalizeHeaderProps === 'function') {
                props = HN.normalizeHeaderProps(props);
            }
            var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
            if (JA && item.alias === 'JSONPathAssertion' && typeof JA.normalizeJsonAssertProps === 'function') {
                props = JA.normalizeJsonAssertProps(props);
            }
            out.catalog_props = props;
        }
        if (Array.isArray(item.children) && item.children.length) {
            out.children = item.children.map(catalogChildToYaml).filter(Boolean);
        }
        return out;
    }

    function parseCatalogChildFromYaml(raw) {
        if (!raw || raw.type !== 'catalog_element') return null;
        var item = Object.assign({ id: 'cat_' + Math.random().toString(36).slice(2, 10) }, raw, {
            type: 'catalog_element',
            children: Array.isArray(raw.children) ? raw.children.map(parseCatalogChildFromYaml).filter(Boolean) : undefined
        });
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && item.alias === 'HeaderManager' && typeof HN.normalizeCatalogElementStep === 'function') {
            HN.normalizeCatalogElementStep(item);
        }
        var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA && item.alias === 'JSONPathAssertion' && typeof JA.normalizeCatalogElementStep === 'function') {
            JA.normalizeCatalogElementStep(item);
        }
        return item;
    }

    function renderListHtml(step) {
        var list = step && step.catalog_hash_children;
        if (!list || !list.length) return '';
        var rows = list.map(function (item, i) {
            var label = item.label_zh || item.name || item.alias || '元件';
            var cat = item.category || '';
            return '<div class="jms-http-context__catalog-child-row" data-catalog-child-index="' + i + '">' +
                '<span class="jms-aux-type">' + cat + '</span>' +
                '<span class="jms-http-context__catalog-child-name">' + label + '</span></div>';
        }).join('');
        return '<div class="jms-http-context__catalog-children">' +
            '<div class="jms-http-context__catalog-children-head"><span>Catalog 子元件</span>' +
            '<span class="jms-http-context__catalog-child-count">' + list.length + ' 个</span></div>' +
            rows + '</div>';
    }

    function bindRenderHook() {
        /* v2fix6: catalog 子元件改由 HTTP mount 树渲染，不再重复注入详情面板 */
    }

    global.JmsCatalogSamplerChildren = {
        findSamplerStep: findSamplerStep,
        findMountHostStep: findMountHostStep,
        appendUnderMountHost: appendUnderMountHost,
        appendUnderSampler: appendUnderSampler,
        catalogChildToYaml: catalogChildToYaml,
        parseCatalogChildFromYaml: parseCatalogChildFromYaml,
        renderListHtml: renderListHtml,
        bindRenderHook: bindRenderHook
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindRenderHook);
    } else {
        setTimeout(bindRenderHook, 120);
    }
    global.addEventListener('pageshow', bindRenderHook);
})(window);

/* ---- js/jms_catalog_sampler_children_jmx.js ---- */
/**
 * JMeter catalog · HTTP 取样器 hashTree 子元件 JMX 导出（隔离模块）
 */
(function (global) {
    'use strict';

    function genXml(step, childPad, escapeXml) {
        var list = step && step.catalog_hash_children;
        if (!list || !list.length) return '';
        var xml = '';
        list.forEach(function (item) {
            if (global.JmxCatalogElement && typeof global.JmxCatalogElement.genXml === 'function') {
                xml += global.JmxCatalogElement.genXml(item, childPad, { escapeXml: escapeXml });
            }
        });
        return xml;
    }

    function hasChildren(step) {
        return !!(step && Array.isArray(step.catalog_hash_children) && step.catalog_hash_children.length);
    }

    global.JmsCatalogSamplerChildrenJmx = {
        genXml: genXml,
        hasChildren: hasChildren
    };
})(window);

/* ---- js/jms_studio_catalog_bridge.js ---- */
/**
 * JMeter 压测 · catalog 组件添加桥接（隔离模块，不修改 appendAuxStep）
 */
(function (global) {
    'use strict';

    function uid() {
        return 'cat_' + Math.random().toString(36).slice(2, 10);
    }

    function toast(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error', placement: 'bottom' });
        }
    }

    function getTemplates(state) {
        return (state && state.templates) || {};
    }

    var CONTAINER_ALIASES = {
        IfController: 1,
        RandomController: 1,
        GenericController: 1,
        SimpleController: 1,
        TransactionController: 1,
        LoopController: 1
    };

    function isContainerComp(comp) {
        if (!comp) return false;
        return !!(comp.container || comp.category === 'controller' || CONTAINER_ALIASES[comp.alias]);
    }

    function buildCatalogStep(comp, templates) {
        var tpl = templates[comp.alias] || {};
        var name = comp.label_zh || comp.alias;
        var seq = Math.floor(Math.random() * 900) + 100;
        var container = isContainerComp(comp);
        return {
            id: uid(),
            type: 'catalog_element',
            name: name + ' ' + seq,
            enabled: true,
            alias: comp.alias,
            testclass: tpl.testclass || comp.alias,
            guiclass: tpl.guiclass || (comp.alias + 'Gui'),
            jmeter_class: comp.class || tpl.class || '',
            category: comp.category || 'other',
            label_zh: comp.label_zh || comp.alias,
            container: container,
            scope: comp.scope || 'core',
            jmx_fragment: tpl.jmx_fragment || '',
            children: container ? [] : undefined
        };
    }

    function addConfigItem(vb, planId, tgId, configType, label) {
        if (!global.JmsTgConfigCatalog) return false;
        var model = vb.getModel();
        var sid = global.JmsCatalogContextAppend && global.JmsCatalogContextAppend.sid
            ? global.JmsCatalogContextAppend.sid
            : function (v) { return v == null ? '' : String(v); };
        var plan = (model.test_plans || []).filter(function (p) { return p && sid(p.id) === sid(planId); })[0];
        if (!plan) return false;
        var tg = [].concat(plan.thread_groups || [], model.setup_thread_groups || [], model.post_thread_groups || [])
            .filter(function (t) { return t && sid(t.id) === sid(tgId); })[0];
        if (!tg) return false;
        if (!Array.isArray(tg.config_items)) tg.config_items = [];
        var item = global.JmsTgConfigCatalog.normalizeItem({
            id: uid(),
            type: configType,
            name: label || global.JmsTgConfigCatalog.LABELS[configType] || configType,
            data: global.JmsTgConfigCatalog.defaultItemData(configType)
        });
        if (!item) return false;
        tg.config_items.push(item);
        vb.notifyUserEdit();
        vb.syncYamlFromModel();
        if (typeof vb.triggerRender === 'function') vb.triggerRender();
        return true;
    }

    function addViaMapped(vb, planId, tgId, parentStepId, mapped, comp) {
        if (mapped.kind === 'http') {
            if (typeof vb.addBlankHttpStepAt === 'function') {
                vb.addBlankHttpStepAt(planId, tgId, parentStepId || null);
                return true;
            }
            if (typeof vb.triggerTgAddHttpStep === 'function') {
                vb.triggerTgAddHttpStep(planId, tgId);
                return true;
            }
            return false;
        }
        if (mapped.kind === 'aux') {
            if (parentStepId && typeof vb.appendAuxStepToParent === 'function') {
                vb.appendAuxStepToParent(planId, tgId, parentStepId, mapped.auxType);
                return true;
            }
            if (typeof vb.appendAuxStep === 'function') {
                vb.appendAuxStep(planId, tgId, mapped.auxType);
                return true;
            }
            return false;
        }
        if (mapped.kind === 'config') {
            return addConfigItem(vb, planId, tgId, mapped.configType, comp.label_zh);
        }
        return false;
    }

    function appendCatalogElement(vb, comp, insertCtx, catalogState) {
        var Editor = global.JmsCatalogElementEditorUi;
        if (Editor && typeof Editor.openForCreate === 'function') {
            Editor.openForCreate(comp, insertCtx, catalogState || {});
            return { ok: true, mode: 'pending_create', pending: true };
        }
        return { ok: false, error: 'no_editor' };
    }

    function addCatalogComponent(comp, insertCtx, catalogState) {
        var vb = global.JmsVisualBuilder;
        if (!vb) {
            toast('可视化编辑器未就绪', false);
            return { ok: false, error: 'no_vb' };
        }
        if (!comp || !comp.alias) {
            toast('无效组件', false);
            return { ok: false, error: 'no_comp' };
        }
        insertCtx = insertCtx || (global.JmsCatalogPlacement && global.JmsCatalogPlacement.resolveInsertContext(vb));
        if (!insertCtx || !insertCtx.planId) {
            toast('请先选择测试计划', false);
            return { ok: false, error: 'no_plan' };
        }
        if (insertCtx.context !== 'test_plan' && !insertCtx.tgId) {
            toast('请先选择或创建线程组', false);
            return { ok: false, error: 'no_tg' };
        }

        var placement = (catalogState && catalogState.placement) || catalogState || {};
        if (global.JmsCatalogPlacement && !global.JmsCatalogPlacement.componentAllowed(comp, insertCtx.context, placement.hierarchy || placement)) {
            toast('当前位置不可添加该组件', false);
            return { ok: false, error: 'not_allowed' };
        }

        var res = appendCatalogElement(vb, comp, insertCtx, catalogState || {});
        if (res.ok) {
            if (res.pending || res.mode === 'pending_create') return res;
            return res;
        }
        if (res.error === 'no_sampler') {
            toast('未找到取样器，无法添加该元件', false);
        } else if (res.error === 'parent_not_found') {
            toast('添加失败：未找到目标逻辑控制器', false);
        } else if (res.error === 'parent_not_container') {
            toast('添加失败：目标节点不是可挂载容器', false);
        } else if (res.error === 'no_tg') {
            toast('添加失败：未找到线程组', false);
        } else if (res.error === 'append_failed') {
            toast('添加失败：无法写入步骤树', false);
        } else if (res.error === 'no_api') {
            toast('catalog 添加接口未加载', false);
        } else {
            toast('添加失败：' + (comp.label_zh || comp.alias), false);
        }
        return res;
    }

    global.JmsStudioCatalogBridge = {
        addCatalogComponent: addCatalogComponent,
        buildCatalogStep: buildCatalogStep,
        appendCatalogElement: appendCatalogElement
    };
})(window);

/* ---- js/jms_catalog_refresh.js ---- */
/**
 * JMeter catalog · 添加后刷新步骤区（树形 / 卡片视图）
 */
(function (global) {
    'use strict';

    function sid(v) {
        return v == null ? '' : String(v);
    }

    function isPlanLevelCtx(insertCtx) {
        insertCtx = insertCtx || {};
        return !!(insertCtx.planLevel || insertCtx.context === 'test_plan');
    }

    function refreshStepsArea(vb, planId, tgId, insertCtx) {
        if (!vb) return;
        planId = sid(planId);
        tgId = sid(tgId);
        insertCtx = insertCtx || {};

        if (typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();

        if (isPlanLevelCtx(insertCtx) || !tgId) {
            if (typeof vb.triggerRender === 'function') vb.triggerRender();
            else if (typeof vb.scheduleRender === 'function') vb.scheduleRender();
            if (global.JmsPlanCatalogItemsUi && typeof global.JmsPlanCatalogItemsUi.syncNavPlanId === 'function') {
                global.JmsPlanCatalogItemsUi.syncNavPlanId(planId);
            }
            return;
        }

        var shell = global.JmsTgTreeShell;
        if (shell && typeof shell.refreshTgDetailByTgId === 'function') {
            if (shell.refreshTgDetailByTgId(planId, tgId)) return;
            if (typeof shell.syncAll === 'function') shell.syncAll(true);
            return;
        }

        if (typeof vb.triggerRender === 'function') vb.triggerRender();
        else if (typeof vb.scheduleRender === 'function') vb.scheduleRender();
    }

    global.JmsCatalogRefresh = {
        sid: sid,
        refreshStepsArea: refreshStepsArea
    };
})(window);

/* ---- js/jms_catalog_refresh_scroll_sticky_v1.js ---- */
/**
 * catalog 添加后 · 步骤区滚动位置保持（隔离补丁 v2）
 * - 延长重试窗口，覆盖 applyIfCollapseState / CardToggle.applyState 后的布局抖动
 * - 增强 JmsTgTreeScrollPreserve.restore，避免新 DOM 未撑开时 scrollTop 写入失败
 */
(function (global) {
    'use strict';

    function sid(v) {
        return v == null ? '' : String(v);
    }

    function findPlanCard(planId) {
        if (!planId) return null;
        return global.document.querySelector('.jms-plan-card[data-plan-id="' + sid(planId) + '"]');
    }

    function capture(planId) {
        var SP = global.JmsTgTreeScrollPreserve;
        var card = findPlanCard(planId);
        if (!SP || !SP.capture || !card) return null;
        return SP.capture(card);
    }

    function restore(planId, snap) {
        if (!snap) return;
        var SP = global.JmsTgTreeScrollPreserve;
        var card = findPlanCard(planId);
        if (!SP || !SP.restore || !card) return;
        SP.restore(card, snap);
    }

    function forceStepsScroll(card, snap) {
        if (!card || !snap) return false;
        var steps = card.querySelector('.jms-tg-tree-steps');
        if (!steps) return false;
        var target = snap.stepsTop || 0;
        if (target <= 0) return true;
        var max = Math.max(0, steps.scrollHeight - steps.clientHeight);
        var next = Math.min(target, max);
        if (steps.scrollTop !== next) steps.scrollTop = next;
        return Math.abs(steps.scrollTop - target) <= 2 || steps.scrollTop >= next;
    }

    function restoreWithRetries(planId, snap, times, delayMs) {
        if (!snap || !planId) return;
        var card = findPlanCard(planId);
        var left = times || 0;
        function tick() {
            restore(planId, snap);
            if (card) forceStepsScroll(card, snap);
            if (left > 0) {
                left -= 1;
                global.setTimeout(tick, delayMs || 48);
            }
        }
        tick();
    }

    function scheduleLongRestore(planId, snap) {
        if (!snap || !planId) return;
        var delays = [0, 16, 48, 80, 120, 160, 220, 300];
        delays.forEach(function (ms) {
            global.setTimeout(function () {
                restoreWithRetries(planId, snap, 1, 0);
            }, ms);
        });
    }

    function patchScrollPreserve() {
        var SP = global.JmsTgTreeScrollPreserve;
        if (!SP || SP.__scrollStickyV2) return;
        SP.__scrollStickyV2 = true;
        var orig = SP.restore;
        SP.restore = function (card, snap) {
            if (!snap || !card) return;
            forceStepsScroll(card, snap);
            if (typeof orig === 'function') orig(card, snap);
            global.setTimeout(function () { forceStepsScroll(card, snap); }, 0);
            global.setTimeout(function () { forceStepsScroll(card, snap); }, 60);
            global.setTimeout(function () { forceStepsScroll(card, snap); }, 120);
        };
    }

    function patchCatalogRefresh() {
        var CR = global.JmsCatalogRefresh;
        if (!CR || CR.__scrollStickyV2) return;
        CR.__scrollStickyV2 = true;
        var orig = CR.refreshStepsArea;
        CR.refreshStepsArea = function (vb, planId, tgId, insertCtx) {
            var snap = capture(planId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            scheduleLongRestore(planId, snap);
        };
    }

    function patchCatalogPostAdd() {
        var PA = global.JmsCatalogPostAdd;
        if (!PA || PA.__scrollStickyV2) return;
        PA.__scrollStickyV2 = true;
        var orig = PA.refreshAfterSave;
        PA.refreshAfterSave = function (vb, planId, tgId, step, insertCtx) {
            var snap = capture(planId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            scheduleLongRestore(planId, snap);
        };
    }

    function patchCatalogCardToggle() {
        var CT = global.JmsCatalogCardToggle;
        if (!CT || CT.__scrollStickyV2) return;
        CT.__scrollStickyV2 = true;
        var orig = CT.applyState;
        CT.applyState = function (planCard) {
            var planId = planCard && planCard.getAttribute('data-plan-id');
            var snap = capture(planId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            scheduleLongRestore(planId, snap);
        };
    }

    function patchTreeShellRefresh() {
        var SH = global.JmsTgTreeShell;
        if (!SH || SH.__scrollStickyV2 || typeof SH.refreshTgDetailByTgId !== 'function') return;
        SH.__scrollStickyV2 = true;
        var orig = SH.refreshTgDetailByTgId;
        SH.refreshTgDetailByTgId = function (planId, tgId) {
            var snap = capture(planId);
            var ok = orig.apply(this, arguments);
            if (ok) scheduleLongRestore(planId, snap);
            return ok;
        };
    }

    function bind() {
        patchScrollPreserve();
        patchCatalogRefresh();
        patchCatalogPostAdd();
        patchCatalogCardToggle();
        patchTreeShellRefresh();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogRefreshScrollSticky = {
        capture: capture,
        restoreWithRetries: restoreWithRetries,
        scheduleLongRestore: scheduleLongRestore
    };
})(window);

/* ---- js/jms_catalog_context_append.js ---- */
/**
 * JMeter catalog · 线程组 / 逻辑控制器层级写入（隔离模块，不修改 appendCatalogElementStep）
 */
(function (global) {
    'use strict';

    function sid(v) {
        return v == null ? '' : String(v);
    }

    function findPlan(model, planId) {
        if (!model || !planId) return null;
        var want = sid(planId);
        return (model.test_plans || []).filter(function (p) {
            return p && sid(p.id) === want;
        })[0] || null;
    }

    function findTgInPlan(plan, tgId) {
        if (!plan || !tgId) return null;
        var want = sid(tgId);
        return (plan.thread_groups || []).filter(function (t) {
            return t && sid(t.id) === want;
        })[0] || null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var want = sid(tgId);

        var plan = findPlan(model, planId);
        var tg = plan ? findTgInPlan(plan, tgId) : null;
        if (tg) return tg;

        var plans = model.test_plans || [];
        for (var pi = 0; pi < plans.length; pi += 1) {
            tg = findTgInPlan(plans[pi], tgId);
            if (tg) return tg;
        }

        tg = (model.setup_thread_groups || []).filter(function (t) {
            return t && sid(t.id) === want;
        })[0];
        if (tg) return tg;

        return (model.post_thread_groups || []).filter(function (t) {
            return t && sid(t.id) === want;
        })[0] || null;
    }

    function resolvePlanTg(vb, planId, tgId) {
        if (typeof vb.readModelFromDom === 'function') vb.readModelFromDom();
        var model = vb.getModel();
        if (!model) return { model: null, plan: null, tg: null };

        var tg = findTg(model, planId, tgId);
        var plan = findPlan(model, planId);
        if (!plan && tg) {
            var plans = model.test_plans || [];
            for (var i = 0; i < plans.length; i += 1) {
                if (findTgInPlan(plans[i], tgId)) {
                    plan = plans[i];
                    planId = plan.id;
                    break;
                }
            }
        }
        if (!tg && typeof vb.resolveActiveThreadGroupContext === 'function') {
            var active = vb.resolveActiveThreadGroupContext();
            if (active && sid(active.tgId) === sid(tgId)) {
                plan = findPlan(model, active.planId) || plan;
                tg = findTg(model, active.planId, active.tgId);
                if (tg) {
                    planId = active.planId;
                    tgId = active.tgId;
                }
            } else if (active && !tgId) {
                tg = findTg(model, active.planId, active.tgId);
                if (tg) {
                    planId = active.planId;
                    tgId = active.tgId;
                }
            }
        }

        return { model: model, plan: plan, tg: tg, planId: planId, tgId: tgId };
    }

    function isCatalogContainer(step) {
        return !!(step && step.type === 'catalog_element' && step.container);
    }

    function isLogicContainer(step) {
        if (!step) return false;
        var IC = global.JmsInsertContextV2;
        if (IC && typeof IC.isContainer === 'function') return IC.isContainer(step);
        var types = ['if_controller', 'random_controller', 'simple_controller', 'transaction_controller', 'loop_controller'];
        return types.indexOf(step.type) >= 0 || isCatalogContainer(step);
    }

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        var want = sid(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (sid(s.id) === want) return s;
            if (Array.isArray(s.children)) {
                var nested = findStepInList(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function resolveTargetList(tg, insertCtx) {
        insertCtx = insertCtx || {};
        var ctx = insertCtx.context;
        if (ctx === 'sampler' || ctx === 'sampler_child') return { error: 'sampler_context' };

        if (ctx === 'controller') {
            var parentId = insertCtx.parentStepId;
            if (!parentId) return { error: 'no_parent' };
            var parent = findStepInList(tg.steps, parentId);
            if (!parent) return { error: 'parent_not_found' };
            if (!isLogicContainer(parent)) return { error: 'parent_not_container' };
            if (!parent.children) parent.children = [];
            return { list: parent.children, host: parent, mount: 'controller_child' };
        }

        if (!tg.steps) tg.steps = [];
        return { list: tg.steps, host: tg, mount: 'thread_group' };
    }

    function appendCatalogAtContext(vb, stepData, insertCtx) {
        if (!vb || !stepData || !insertCtx) return { ok: false, error: 'bad_args' };
        if (insertCtx.context === 'sampler' || insertCtx.context === 'sampler_child') {
            return { ok: false, error: 'sampler_context' };
        }

        var loc = resolvePlanTg(vb, insertCtx.planId, insertCtx.tgId);
        if (!loc.tg) return { ok: false, error: 'no_tg' };

        var target = resolveTargetList(loc.tg, insertCtx);
        if (target.error) return { ok: false, error: target.error };

        var item = Object.assign({}, stepData);
        if (!item.id) item.id = 'cat_' + Math.random().toString(36).slice(2, 10);
        if (item.container && !Array.isArray(item.children)) item.children = [];

        target.list.push(item);
        if (typeof vb.notifyUserEdit === 'function') vb.notifyUserEdit();

        return {
            ok: true,
            step: item,
            planId: loc.planId,
            tgId: loc.tgId,
            mount: target.mount
        };
    }

    global.JmsCatalogContextAppend = {
        appendCatalogAtContext: appendCatalogAtContext,
        findStepInList: findStepInList,
        findTg: findTg,
        findPlan: findPlan,
        resolvePlanTg: resolvePlanTg,
        isLogicContainer: isLogicContainer,
        sid: sid
    };
})(window);

/* ---- js/jms_catalog_controller_mount_post_add_v1.js ---- */
/**
 * catalog 逻辑控制器挂载区 · 添加配置/定时器等后局部刷新（深层嵌套）
 */
(function (global) {
    'use strict';

    function isControllerMountAux(insertCtx, step) {
        if (!insertCtx || !insertCtx.controllerMount || !insertCtx.parentStepId || !step) return false;
        var TA = global.JmsCatalogControllerTreeChildAppend;
        if (TA && typeof TA.isTreeChild === 'function' && TA.isTreeChild(step)) return false;
        return true;
    }

    function refreshHostBody(planId, tgId, hostStepId) {
        if (!planId || !tgId || !hostStepId) return false;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        var vb = global.JmsVisualBuilder;
        var R = global.JmsMountHostResolver;
        var Rows = global.JmsTgIfMountTreeRows;
        if (!vb || !R || !Rows || typeof Rows.patchIfBodyInDom !== 'function') return false;
        var host = R.findMountHostStep(vb.getModel(), planId, tgId, hostStepId);
        if (!host) return false;
        return Rows.patchIfBodyInDom(stepsEl, host, planId, tgId, '');
    }

    function patchPostAdd() {
        var PA = global.JmsCatalogPostAdd;
        if (!PA || PA.__controllerMountPostAddV1) return;
        PA.__controllerMountPostAddV1 = true;
        var orig = PA.refreshAfterSave;
        PA.refreshAfterSave = function (vb, planId, tgId, step, insertCtx) {
            insertCtx = insertCtx || {};
            var hostId = insertCtx.parentStepId;
            var needPatch = isControllerMountAux(insertCtx, step);
            if (typeof orig === 'function') orig.apply(this, arguments);
            if (needPatch && hostId) {
                global.setTimeout(function () { refreshHostBody(planId, tgId, hostId); }, 60);
                global.setTimeout(function () { refreshHostBody(planId, tgId, hostId); }, 180);
            }
        };
    }

    function bind() { patchPostAdd(); }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogControllerMountPostAdd = { refreshHostBody: refreshHostBody };
})(window);

/* ---- js/jms_catalog_nested_depth_guard_v1.js ---- */
/**
 * catalog 深层嵌套 · 深度上限（对齐 JMeter GUI 可嵌套语义，防止异常深树）
 */
(function (global) {
    'use strict';

    var MAX_CONTROLLER_DEPTH = 48;

    function toast(msg) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(msg, { variant: 'error', placement: 'bottom' });
        }
    }

    function findTgSteps(vb, planId, tgId) {
        if (!vb || typeof vb.getModel !== 'function') return null;
        var CA = global.JmsCatalogContextAppend;
        if (!CA || typeof CA.findTg !== 'function') return null;
        var tg = CA.findTg(vb.getModel(), planId, tgId);
        return tg && tg.steps ? tg.steps : null;
    }

    function depthOfStep(steps, stepId, depth) {
        if (!steps || !stepId) return -1;
        depth = depth || 0;
        var i, s, nested;
        for (i = 0; i < steps.length; i += 1) {
            s = steps[i];
            if (!s) continue;
            if (String(s.id) === String(stepId)) return depth;
            if (Array.isArray(s.children) && s.children.length) {
                nested = depthOfStep(s.children, stepId, depth + 1);
                if (nested >= 0) return nested;
            }
        }
        return -1;
    }

    function wouldExceed(parentStepId, planId, tgId) {
        var vb = global.JmsVisualBuilder;
        var steps = findTgSteps(vb, planId, tgId);
        if (!steps || !parentStepId) return false;
        var d = depthOfStep(steps, parentStepId, 0);
        return d >= 0 && d + 1 >= MAX_CONTROLLER_DEPTH;
    }

    function patchTreeAppend() {
        var TA = global.JmsCatalogControllerTreeChildAppend;
        if (!TA || TA.__depthGuardV1) return;
        TA.__depthGuardV1 = true;
        var orig = TA.append;
        TA.append = function (vb, step, ctx) {
            ctx = ctx || {};
            if (wouldExceed(ctx.parentStepId, ctx.planId, ctx.tgId)) {
                toast('逻辑控制器嵌套已达上限（' + MAX_CONTROLLER_DEPTH + ' 层），请减少嵌套深度');
                return null;
            }
            return orig.apply(this, arguments);
        };
    }

    function patchContextAppend() {
        var CA = global.JmsCatalogContextAppend;
        if (!CA || CA.__depthGuardV1) return;
        CA.__depthGuardV1 = true;
        var orig = CA.appendCatalogAtContext;
        CA.appendCatalogAtContext = function (vb, stepData, insertCtx) {
            insertCtx = insertCtx || {};
            if (insertCtx.context === 'controller' && insertCtx.parentStepId &&
                wouldExceed(insertCtx.parentStepId, insertCtx.planId, insertCtx.tgId)) {
                toast('逻辑控制器嵌套已达上限（' + MAX_CONTROLLER_DEPTH + ' 层），请减少嵌套深度');
                return { ok: false, error: 'max_depth' };
            }
            return orig.apply(this, arguments);
        };
    }

    function bind() {
        patchTreeAppend();
        patchContextAppend();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogNestedDepthGuard = { MAX_CONTROLLER_DEPTH: MAX_CONTROLLER_DEPTH };
})(window);

/* ---- js/jms_catalog_controller_tree_child_append_v1.js ---- */
/**
 * 逻辑控制器嵌套子步骤 · hashTree children 写入（隔离模块）
 * 修复：controllerMount 下 controller/sampler 误写入 catalog_hash_children 导致树区不展示
 */
(function (global) {
    'use strict';

    var TREE_CHILD_CATEGORIES = { controller: 1, sampler: 1 };

    function isTreeChild(step) {
        if (!step) return false;
        if (step.container) return true;
        var cat = step.category || '';
        return !!TREE_CHILD_CATEGORIES[cat];
    }

    function normalizeTreeCtx(ctx) {
        var treeCtx = Object.assign({}, ctx || {}, {
            context: 'controller',
            parentStepId: ctx && ctx.parentStepId ? ctx.parentStepId : null
        });
        delete treeCtx.controllerMount;
        delete treeCtx.httpMount;
        return treeCtx;
    }

    function append(vb, step, ctx) {
        if (!vb || !step || !ctx || !ctx.parentStepId) return null;
        var CA = global.JmsCatalogContextAppend;
        if (!CA || typeof CA.appendCatalogAtContext !== 'function') return null;
        var res = CA.appendCatalogAtContext(vb, step, normalizeTreeCtx(ctx));
        return res && res.ok ? res.step : null;
    }

    global.JmsCatalogControllerTreeChildAppend = {
        isTreeChild: isTreeChild,
        append: append,
        normalizeTreeCtx: normalizeTreeCtx
    };
})(window);

/* ---- js/jms_catalog_schema_extend.js ---- */
/**
 * JMeter catalog · 全量 alias schema 扩展（由 jmeter_component_catalog.json 生成）
 * 未在 ALIAS_SCHEMAS 中定义的 alias 使用类别/名称模式回退字段。
 */
(function (global) {
    'use strict';

    var LANG_OPTS = [
        { val: 'groovy', label: 'groovy' },
        { val: 'javascript', label: 'javascript' },
        { val: 'beanshell', label: 'beanshell' },
        { val: 'jython', label: 'jython' }
    ];

    var SCRIPT_FIELDS = [
        { key: 'script', type: 'textarea', label: '脚本', default: '' },
        { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
    ];

    var JSR223_FIELDS = [
        { key: 'script', type: 'textarea', label: '脚本', default: '' },
        { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS },
        { key: 'filename', type: 'text', label: '文件名 (可选)', default: '' },
        { key: 'parameters', type: 'text', label: '参数 (可选)', default: '' }
    ];

    var ALIAS_META = {
    "BSFAssertion": {
        "category": "assertion",
        "label_zh": "BSFAssertion"
    },
    "BeanShellAssertion": {
        "category": "assertion",
        "label_zh": "BeanShell 断言"
    },
    "CompareAssertion": {
        "category": "assertion",
        "label_zh": "CompareAssertion"
    },
    "HTMLAssertion": {
        "category": "assertion",
        "label_zh": "HTMLAssertion"
    },
    "JMESPathAssertion": {
        "category": "assertion",
        "label_zh": "JMESPathAssertion"
    },
    "JSONPathAssertion": {
        "category": "assertion",
        "label_zh": "JSON 断言"
    },
    "JSR223Assertion": {
        "category": "assertion",
        "label_zh": "JSR223 断言"
    },
    "MD5HexAssertion": {
        "category": "assertion",
        "label_zh": "MD5 断言"
    },
    "MD5HexAssertionGUI": {
        "category": "assertion",
        "label_zh": "MD5HexAssertionGUI"
    },
    "SMIMEAssertion": {
        "category": "assertion",
        "label_zh": "SMIMEAssertion"
    },
    "SubstitutionElement": {
        "category": "assertion",
        "label_zh": "SubstitutionElement"
    },
    "XMLAssertion": {
        "category": "assertion",
        "label_zh": "XML 断言"
    },
    "XMLSchemaAssertion": {
        "category": "assertion",
        "label_zh": "XMLSchemaAssertion"
    },
    "XMLSchemaAssertionGUI": {
        "category": "assertion",
        "label_zh": "XMLSchemaAssertionGUI"
    },
    "XPathAssertion": {
        "category": "assertion",
        "label_zh": "XPath 断言"
    },
    "XPath2Assertion": {
        "category": "assertion",
        "label_zh": "XPath2 断言"
    },
    "assertionResult": {
        "category": "assertion",
        "label_zh": "assertionResult"
    },
    "ResponseAssertion": {
        "category": "assertion",
        "label_zh": "响应断言"
    },
    "SizeAssertion": {
        "category": "assertion",
        "label_zh": "大小断言"
    },
    "DurationAssertion": {
        "category": "assertion",
        "label_zh": "持续时间断言"
    },
    "BoltConnectionElement": {
        "category": "config",
        "label_zh": "BoltConnectionElement"
    },
    "CSVDataSet": {
        "category": "config",
        "label_zh": "CSV 数据文件设置"
    },
    "ConfigTestElement": {
        "category": "config",
        "label_zh": "HTTP 请求默认值"
    },
    "JDBCDataSource": {
        "category": "config",
        "label_zh": "JDBCDataSource"
    },
    "JavaConfig": {
        "category": "config",
        "label_zh": "JavaConfig"
    },
    "KeystoreConfig": {
        "category": "config",
        "label_zh": "Keystore 配置"
    },
    "LDAPArgument": {
        "category": "config",
        "label_zh": "LDAPArgument"
    },
    "LDAPArguments": {
        "category": "config",
        "label_zh": "LDAPArguments"
    },
    "MongoSourceElement": {
        "category": "config",
        "label_zh": "MongoSourceElement"
    },
    "LoginConfig": {
        "category": "config",
        "label_zh": "登录配置"
    },
    "InterThread Communication": {
        "category": "config",
        "label_zh": "线程间通信"
    },
    "RandomVariableConfig": {
        "category": "config",
        "label_zh": "随机变量"
    },
    "Authorization": {
        "category": "controller",
        "label_zh": "Authorization"
    },
    "Cookie": {
        "category": "controller",
        "label_zh": "Cookie"
    },
    "DNSCacheManager": {
        "category": "controller",
        "label_zh": "DNS 缓存管理器"
    },
    "ForeachController": {
        "category": "controller",
        "label_zh": "ForeachController"
    },
    "GenericController": {
        "category": "controller",
        "label_zh": "GenericController"
    },
    "CookieManager": {
        "category": "controller",
        "label_zh": "HTTP Cookie 管理器"
    },
    "Arguments": {
        "category": "config",
        "label_zh": "用户定义的变量"
    },
    "HeaderManager": {
        "category": "config",
        "label_zh": "HTTP 信息头管理器"
    },
    "AuthManager": {
        "category": "controller",
        "label_zh": "HTTP 授权管理器"
    },
    "CacheManager": {
        "category": "controller",
        "label_zh": "HTTP 缓存管理器"
    },
    "Header": {
        "category": "controller",
        "label_zh": "Header"
    },
    "HttpMirrorControl": {
        "category": "controller",
        "label_zh": "HttpMirrorControl"
    },
    "HttpTestSampleGui,HttpTestSampleGui2": {
        "category": "controller",
        "label_zh": "HttpTestSampleGui,HttpTestSampleGui2"
    },
    "IfController": {
        "category": "controller",
        "label_zh": "If 控制器"
    },
    "IncludeController": {
        "category": "controller",
        "label_zh": "Include 控制器"
    },
    "RecordController": {
        "category": "controller",
        "label_zh": "RecordController"
    },
    "StaticHost": {
        "category": "controller",
        "label_zh": "StaticHost"
    },
    "SwitchController": {
        "category": "controller",
        "label_zh": "Switch 控制器"
    },
    "TransactionSampler": {
        "category": "controller",
        "label_zh": "TransactionSampler"
    },
    "WhileController": {
        "category": "controller",
        "label_zh": "While 控制器"
    },
    "CriticalSectionController": {
        "category": "controller",
        "label_zh": "临界区控制器"
    },
    "TransactionController": {
        "category": "controller",
        "label_zh": "事务控制器"
    },
    "InterleaveControl": {
        "category": "controller",
        "label_zh": "交替控制器"
    },
    "OnceOnlyController": {
        "category": "controller",
        "label_zh": "仅一次控制器"
    },
    "ThroughputController": {
        "category": "controller",
        "label_zh": "吞吐量控制器"
    },
    "RecordingController": {
        "category": "controller",
        "label_zh": "录制控制器"
    },
    "LoopController": {
        "category": "controller",
        "label_zh": "循环控制器"
    },
    "ModuleController": {
        "category": "controller",
        "label_zh": "模块控制器"
    },
    "TestFragmentController": {
        "category": "controller",
        "label_zh": "测试片段"
    },
    "RunTime": {
        "category": "controller",
        "label_zh": "运行时间控制器"
    },
    "RandomController": {
        "category": "controller",
        "label_zh": "随机控制器"
    },
    "RandomOrderController": {
        "category": "controller",
        "label_zh": "随机顺序控制器"
    },
    "BSFListener": {
        "category": "listener",
        "label_zh": "BSFListener"
    },
    "BackendListener": {
        "category": "listener",
        "label_zh": "Backend Listener"
    },
    "BeanShellListener": {
        "category": "listener",
        "label_zh": "BeanShellListener"
    },
    "JSR223Listener": {
        "category": "listener",
        "label_zh": "JSR223Listener"
    },
    "MailerResultCollector": {
        "category": "listener",
        "label_zh": "MailerResultCollector"
    },
    "PerfMon Metrics Collector": {
        "category": "listener",
        "label_zh": "PerfMon 性能监控"
    },
    "ResultAction": {
        "category": "listener",
        "label_zh": "ResultAction"
    },
    "SimpleDataWriter": {
        "category": "listener",
        "label_zh": "SimpleDataWriter"
    },
    "Summariser": {
        "category": "listener",
        "label_zh": "Summariser"
    },
    "monitorStats": {
        "category": "listener",
        "label_zh": "monitorStats"
    },
    "SummaryReport": {
        "category": "listener",
        "label_zh": "汇总报告"
    },
    "Flexible File Writer": {
        "category": "listener",
        "label_zh": "灵活文件写入器"
    },
    "ResultCollector": {
        "category": "listener",
        "label_zh": "结果收集器"
    },
    "AnchorModifier": {
        "category": "other",
        "label_zh": "AnchorModifier"
    },
    "ProxyControl": {
        "category": "other",
        "label_zh": "HTTP(S) 测试脚本录制"
    },
    "HTTPArgument": {
        "category": "other",
        "label_zh": "HTTPArgument"
    },
    "HTTPFileArg": {
        "category": "other",
        "label_zh": "HTTPFileArg"
    },
    "HTTPFileArgs": {
        "category": "other",
        "label_zh": "HTTPFileArgs"
    },
    "JDBCPostProcessor": {
        "category": "other",
        "label_zh": "JDBCPostProcessor"
    },
    "JDBCPreProcessor": {
        "category": "other",
        "label_zh": "JDBCPreProcessor"
    },
    "JavaTest": {
        "category": "other",
        "label_zh": "JavaTest"
    },
    "ParamMask": {
        "category": "other",
        "label_zh": "ParamMask"
    },
    "ParamModifier": {
        "category": "other",
        "label_zh": "ParamModifier"
    },
    "RegExUserParameters": {
        "category": "other",
        "label_zh": "RegExUserParameters"
    },
    "SampleTimeout": {
        "category": "other",
        "label_zh": "SampleTimeout"
    },
    "TestBeanGUI": {
        "category": "other",
        "label_zh": "TestBeanGUI"
    },
    "URLRewritingModifier": {
        "category": "other",
        "label_zh": "URLRewritingModifier"
    },
    "UserParameterModifier": {
        "category": "other",
        "label_zh": "UserParameterModifier"
    },
    "UserParameters": {
        "category": "other",
        "label_zh": "UserParameters"
    },
    "boolProp": {
        "category": "other",
        "label_zh": "boolProp"
    },
    "collectionProp": {
        "category": "other",
        "label_zh": "collectionProp"
    },
    "doubleProp": {
        "category": "other",
        "label_zh": "doubleProp"
    },
    "elementProp": {
        "category": "other",
        "label_zh": "elementProp"
    },
    "hashTree": {
        "category": "other",
        "label_zh": "hashTree"
    },
    "intProp": {
        "category": "other",
        "label_zh": "intProp"
    },
    "jmeterTestPlan": {
        "category": "other",
        "label_zh": "jmeterTestPlan"
    },
    "longProp": {
        "category": "other",
        "label_zh": "longProp"
    },
    "mapProp": {
        "category": "other",
        "label_zh": "mapProp"
    },
    "objProp": {
        "category": "other",
        "label_zh": "objProp"
    },
    "sample": {
        "category": "other",
        "label_zh": "sample"
    },
    "sampleEvent": {
        "category": "other",
        "label_zh": "sampleEvent"
    },
    "statSample": {
        "category": "other",
        "label_zh": "statSample"
    },
    "stringProp": {
        "category": "other",
        "label_zh": "stringProp"
    },
    "testResults": {
        "category": "other",
        "label_zh": "testResults"
    },
    "CounterConfig": {
        "category": "other",
        "label_zh": "计数器"
    },
    "BSFPostProcessor": {
        "category": "postprocessor",
        "label_zh": "BSFPostProcessor"
    },
    "BeanShellPostProcessor": {
        "category": "postprocessor",
        "label_zh": "BeanShell 后置处理器"
    },
    "DebugPostProcessor": {
        "category": "postprocessor",
        "label_zh": "DebugPostProcessor"
    },
    "HtmlExtractor": {
        "category": "postprocessor",
        "label_zh": "HtmlExtractor"
    },
    "JMESPathExtractor": {
        "category": "postprocessor",
        "label_zh": "JMESPath 提取器"
    },
    "JSONPostProcessor": {
        "category": "postprocessor",
        "label_zh": "JSON 提取器"
    },
    "JSR223PostProcessor": {
        "category": "postprocessor",
        "label_zh": "JSR223 后置处理器"
    },
    "XPathExtractor": {
        "category": "postprocessor",
        "label_zh": "XPath 提取器"
    },
    "XPath2Extractor": {
        "category": "postprocessor",
        "label_zh": "XPath2 提取器"
    },
    "RegexExtractor": {
        "category": "postprocessor",
        "label_zh": "正则表达式提取器"
    },
    "BoundaryExtractor": {
        "category": "postprocessor",
        "label_zh": "边界提取器"
    },
    "BSFPreProcessor": {
        "category": "preprocessor",
        "label_zh": "BSFPreProcessor"
    },
    "BeanShellPreProcessor": {
        "category": "preprocessor",
        "label_zh": "BeanShell 前置处理器"
    },
    "JSR223PreProcessor": {
        "category": "preprocessor",
        "label_zh": "JSR223 前置处理器"
    },
    "AjpSampler": {
        "category": "sampler",
        "label_zh": "AJP 请求"
    },
    "BSFSampler": {
        "category": "sampler",
        "label_zh": "BSF 取样器"
    },
    "BeanShellSampler": {
        "category": "sampler",
        "label_zh": "BeanShell 取样器"
    },
    "BoltSampler": {
        "category": "sampler",
        "label_zh": "Bolt 请求"
    },
    "DebugSampler": {
        "category": "sampler",
        "label_zh": "Debug 取样器"
    },
    "Dummy Sampler": {
        "category": "sampler",
        "label_zh": "Dummy 取样器"
    },
    "FTPSampler": {
        "category": "sampler",
        "label_zh": "FTPSampler"
    },
    "HTTPSampler2_": {
        "category": "sampler",
        "label_zh": "HTTPSampler2_"
    },
    "HTTPSamplerProxy,HTTPSampler,HTTPSampler2": {
        "category": "sampler",
        "label_zh": "HTTPSamplerProxy,HTTPSampler,HTTPSampler2"
    },
    "HTTPSampler_": {
        "category": "sampler",
        "label_zh": "HTTPSampler_"
    },
    "JDBCSampler": {
        "category": "sampler",
        "label_zh": "JDBC 请求"
    },
    "PublisherSampler": {
        "category": "sampler",
        "label_zh": "JMS 发布"
    },
    "JMSSampler": {
        "category": "sampler",
        "label_zh": "JMS 点对点"
    },
    "SubscriberSampler": {
        "category": "sampler",
        "label_zh": "JMS 订阅"
    },
    "JMSProperties": {
        "category": "sampler",
        "label_zh": "JMSProperties"
    },
    "JSR223Sampler": {
        "category": "sampler",
        "label_zh": "JSR223 取样器"
    },
    "JUnitSampler": {
        "category": "sampler",
        "label_zh": "JUnit 请求"
    },
    "JavaSampler": {
        "category": "sampler",
        "label_zh": "Java 请求"
    },
    "LDAPExtSampler": {
        "category": "sampler",
        "label_zh": "LDAP 扩展请求"
    },
    "LDAPSampler": {
        "category": "sampler",
        "label_zh": "LDAP 请求"
    },
    "MongoScriptSampler": {
        "category": "sampler",
        "label_zh": "MongoDB 脚本"
    },
    "SmtpSampler": {
        "category": "sampler",
        "label_zh": "SMTP 取样器"
    },
    "SoapSampler": {
        "category": "sampler",
        "label_zh": "SoapSampler"
    },
    "SystemSampler": {
        "category": "sampler",
        "label_zh": "SystemSampler"
    },
    "TCPSampler": {
        "category": "sampler",
        "label_zh": "TCPSampler"
    },
    "TestAction": {
        "category": "sampler",
        "label_zh": "TestAction"
    },
    "WebServiceSampler": {
        "category": "sampler",
        "label_zh": "WebServiceSampler"
    },
    "httpSample": {
        "category": "sampler",
        "label_zh": "httpSample"
    },
    "AccessLogSampler": {
        "category": "sampler",
        "label_zh": "访问日志取样器"
    },
    "MailReaderSampler": {
        "category": "sampler",
        "label_zh": "邮件读取取样器"
    },
    "WorkBench": {
        "category": "test_plan",
        "label_zh": "WorkBench"
    },
    "TestPlan": {
        "category": "test_plan",
        "label_zh": "测试计划"
    },
    "Custom Thread Groups": {
        "category": "thread_group",
        "label_zh": "Concurrency Thread Group"
    },
    "OpenModelThreadGroupController": {
        "category": "thread_group",
        "label_zh": "OpenModelThreadGroupController"
    },
    "PostThreadGroup": {
        "category": "thread_group",
        "label_zh": "Post 线程组"
    },
    "ReflectionThreadGroup": {
        "category": "thread_group",
        "label_zh": "ReflectionThreadGroup"
    },
    "SetupThreadGroup": {
        "category": "thread_group",
        "label_zh": "SetUp 线程组"
    },
    "OpenModelThreadGroup": {
        "category": "thread_group",
        "label_zh": "开放模型线程组"
    },
    "ThreadGroup": {
        "category": "thread_group",
        "label_zh": "线程组"
    },
    "BSFTimer": {
        "category": "timer",
        "label_zh": "BSFTimer"
    },
    "BeanShellTimer": {
        "category": "timer",
        "label_zh": "BeanShell 定时器"
    },
    "JSR223Timer": {
        "category": "timer",
        "label_zh": "JSR223 定时器"
    },
    "SyncTimer": {
        "category": "timer",
        "label_zh": "同步定时器"
    },
    "Throughput Shaping Timer": {
        "category": "timer",
        "label_zh": "吞吐量 shaping 定时器"
    },
    "ConstantTimer": {
        "category": "timer",
        "label_zh": "固定定时器"
    },
    "UniformRandomTimer": {
        "category": "timer",
        "label_zh": "均匀随机定时器"
    },
    "ConstantThroughputTimer": {
        "category": "timer",
        "label_zh": "常数吞吐量定时器"
    },
    "PoissonRandomTimer": {
        "category": "timer",
        "label_zh": "泊松随机定时器"
    },
    "PreciseThroughputTimer": {
        "category": "timer",
        "label_zh": "精确吞吐量定时器"
    },
    "GaussianRandomTimer": {
        "category": "timer",
        "label_zh": "高斯随机定时器"
    }
};

    var CONTROLLER_FIELDS = {
        WhileController: [
            { key: 'condition', type: 'textarea', label: '条件', default: '' }
        ],
        ForEachController: [
            { key: 'input_val', type: 'text', label: '输入变量前缀', default: '' },
            { key: 'return_val', type: 'text', label: '输出变量名称', default: '' }
        ],
        ModuleController: [
            { key: 'module_path', type: 'text', label: '模块路径', default: '' }
        ],
        IncludeController: [
            { key: 'include_path', type: 'text', label: 'JMX 文件路径', default: '' }
        ],
        ThroughputController: [
            { key: 'style', type: 'select', label: '样式', default: 'percent', options: [
                { val: 'percent', label: 'Percent executions' },
                { val: 'total', label: 'Total executions' }
            ]},
            { key: 'throughput', type: 'number', label: 'Throughput', default: 1, min: 0 }
        ],
        SwitchController: [
            { key: 'switch_value', type: 'text', label: 'Switch Value', default: '' }
        ],
        RunTimeController: [
            { key: 'seconds', type: 'number', label: '运行时间 (秒)', default: 60, min: 0 }
        ],
        InterleaveController: [
            { key: 'interleave', type: 'checkbox', label: 'Ignore sub-controller blocks', default: false }
        ]
    };

    var CATEGORY_FIELDS = {
        timer: [{ key: 'delay_ms', type: 'number', label: '延迟 (毫秒)', default: 300, min: 0 }],
        assertion: [
            { key: 'test_field', type: 'text', label: '测试字段', default: '' },
            { key: 'pattern', type: 'textarea', label: '模式 / 表达式', default: '' }
        ],
        preprocessor: SCRIPT_FIELDS.slice(),
        postprocessor: SCRIPT_FIELDS.slice(),
        config: [{ key: 'notes', type: 'textarea', label: '配置说明', default: '' }],
        listener: [{ key: 'filename', type: 'text', label: '文件名 (可选)', default: '' }],
        sampler: [
            { key: 'protocol', type: 'text', label: '协议', default: '' },
            { key: 'domain', type: 'text', label: '域名', default: '' },
            { key: 'path', type: 'text', label: '路径', default: '' }
        ],
        controller: [{ key: 'comments', type: 'textarea', label: '备注', default: '' }],
        other: [{ key: 'notes', type: 'textarea', label: '说明', default: '' }]
    };

    function cloneFields(list) {
        return (list || []).map(function (f) {
            var o = {};
            Object.keys(f).forEach(function (k) { o[k] = f[k]; });
            if (Array.isArray(f.options)) o.options = f.options.slice();
            return o;
        });
    }

    function resolveByPattern(alias, category) {
        if (!alias) return null;
        if (CONTROLLER_FIELDS[alias]) return { fields: cloneFields(CONTROLLER_FIELDS[alias]) };
        if (/BeanShell|BSF/.test(alias)) return { fields: cloneFields(SCRIPT_FIELDS) };
        if (/^JSR223/.test(alias)) return { fields: cloneFields(JSR223_FIELDS) };
        if (/Assertion$/.test(alias) || /AssertionGUI$/.test(alias)) {
            return { fields: cloneFields(CATEGORY_FIELDS.assertion) };
        }
        if (/PostProcessor$/.test(alias) || /PreProcessor$/.test(alias)) {
            return { fields: cloneFields(SCRIPT_FIELDS) };
        }
        if (/Timer$/.test(alias)) return { fields: cloneFields(CATEGORY_FIELDS.timer) };
        if (/Sampler$/.test(alias) || category === 'sampler') {
            return { fields: cloneFields(CATEGORY_FIELDS.sampler) };
        }
        if (category && CATEGORY_FIELDS[category]) {
            return { fields: cloneFields(CATEGORY_FIELDS[category]) };
        }
        return { fields: cloneFields(CATEGORY_FIELDS.other) };
    }

    function getSchemaForAlias(step) {
        if (!step) return { fields: [] };
        var alias = step.alias || '';
        var meta = ALIAS_META[alias];
        var category = (meta && meta.category) || step.category || 'other';
        var schema = resolveByPattern(alias, category);
        if (schema && schema.fields && schema.fields.length) {
            schema.fields.unshift({ key: 'comments', type: 'textarea', label: '注释', default: '' });
            if (category === 'other' || category === 'listener') {
                schema.fields.push({ key: 'jmx_fragment', type: 'textarea', label: 'JMX 片段 (高级)', default: '' });
            }
        }
        return schema || { fields: [] };
    }

    function aliasCount() { return Object.keys(ALIAS_META).length; }

    global.JmsCatalogSchemaExtend = {
        ALIAS_META: ALIAS_META,
        getSchemaForAlias: getSchemaForAlias,
        aliasCount: aliasCount
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_element_editor_schema.js ---- */
/**
 * JMeter catalog_element · 各元件配置字段 schema（对齐 JMeter GUI 属性）
 */
(function (global) {
    'use strict';

    var LANG_OPTS = [
        { val: 'groovy', label: 'groovy' },
        { val: 'javascript', label: 'javascript' },
        { val: 'beanshell', label: 'beanshell' },
        { val: 'jython', label: 'jython' }
    ];

    var APPLY_TO_OPTS = [
        { val: 'main_only', label: 'Main sample only' },
        { val: 'main_and_sub', label: 'Main sample and sub-samples' },
        { val: 'sub_only', label: 'Sub-samples only' },
        { val: 'jmeter_variable', label: 'JMeter Variable' }
    ];

    var TEST_FIELD_OPTS = [
        { val: 'response_text', label: '响应文本' },
        { val: 'response_code', label: '响应代码' },
        { val: 'response_message', label: '响应信息' },
        { val: 'response_headers', label: 'Response Headers' },
        { val: 'request_headers', label: 'Request Headers' },
        { val: 'url_sample', label: 'URL样本' },
        { val: 'document', label: 'Document (text)' },
        { val: 'request_data', label: 'Request Data' }
    ];

    var MATCH_MODE_OPTS = [
        { val: 'contains', label: '包括' },
        { val: 'matches', label: '匹配' },
        { val: 'equals', label: 'Equals' },
        { val: 'substring', label: 'Substring' }
    ];

    var EXTRACT_APPLY_OPTS = [
        { val: 'main', label: 'Main sample only' },
        { val: 'sub', label: 'Sub-samples only' },
        { val: 'both', label: 'Main and sub-samples' },
        { val: 'variable', label: 'JMeter Variable Name to use' }
    ];

    var FIELD_CHECK = { val: 'body', label: 'Body' };
    var FIELD_CHECK_OPTS = [
        FIELD_CHECK,
        { val: 'url', label: 'URL' },
        { val: 'headers', label: 'Headers' },
        { val: 'unencoded', label: 'Body (unencoded)' }
    ];

    var ALIAS_SCHEMAS = {
        ConstantTimer: {
            fields: [{ key: 'delay_ms', type: 'number', label: '线程延迟 (毫秒)', default: 300, min: 0 }]
        },
        UniformRandomTimer: {
            fields: [
                { key: 'delay_ms', type: 'number', label: '固定延迟偏移 (毫秒)', default: 0, min: 0 },
                { key: 'random_delay_max', type: 'number', label: '随机延迟最大值 (毫秒)', default: 100, min: 0 }
            ]
        },
        GaussianRandomTimer: {
            fields: [
                { key: 'delay_ms', type: 'number', label: 'Constant Delay Offset (毫秒)', default: 300, min: 0 },
                { key: 'deviation', type: 'number', label: 'Deviation (毫秒)', default: 100, min: 0 }
            ]
        },
        PoissonRandomTimer: {
            fields: [
                { key: 'delay_ms', type: 'number', label: 'Constant Delay Offset (毫秒)', default: 300, min: 0 },
                { key: 'lambda', type: 'number', label: 'Lambda (毫秒)', default: 100, min: 0 }
            ]
        },
        SyncTimer: {
            fields: [
                { key: 'group_size', type: 'number', label: '模拟用户数分组 (0=全部)', default: 0, min: 0 }
            ]
        },
        BSFTimer: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        BeanShellTimer: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        JSR223Timer: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS },
                { key: 'filename', type: 'text', label: '文件名 (可选)', default: '' },
                { key: 'parameters', type: 'text', label: '参数 (可选)', default: '' }
            ]
        },
        ResponseAssertion: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main_only', options: APPLY_TO_OPTS },
                { key: 'jmeter_variable', type: 'text', label: 'JMeter Variable', default: '' },
                { key: 'test_field', type: 'select', label: '测试字段', default: 'response_text', options: TEST_FIELD_OPTS },
                { key: 'match_mode', type: 'select', label: '匹配模式', default: 'substring', options: MATCH_MODE_OPTS },
                { key: 'patterns', type: 'patterns', label: '模式 / 正则 (每行一条)', default: [] },
                { key: 'custom_message', type: 'text', label: '自定义失败消息', default: '' },
                { key: 'ignore_status', type: 'checkbox', label: 'Ignore status', default: false }
            ]
        },
        JSONPathAssertion: {
            fields: [
                { key: 'json_path', type: 'text', label: 'JSON Path', default: '' },
                { key: 'expected_value', type: 'text', label: 'Expected Value', default: '' },
                { key: 'validate_json', type: 'checkbox', label: 'Additionally assert value', default: false },
                { key: 'is_regex', type: 'checkbox', label: 'Match as regular expression', default: false },
                { key: 'expect_null', type: 'checkbox', label: 'Expect null', default: false },
                { key: 'invert', type: 'checkbox', label: 'Invert', default: false }
            ]
        },
        SizeAssertion: {
            fields: [
                { key: 'test_field', type: 'select', label: '测试字段', default: 'response_text', options: TEST_FIELD_OPTS },
                { key: 'size_bytes', type: 'number', label: 'Size (bytes)', default: 0, min: 0 },
                { key: 'compare', type: 'select', label: '比较', default: 'equals', options: [
                    { val: 'equals', label: '=' }, { val: 'not_equal', label: '!=' },
                    { val: 'greater', label: '>' }, { val: 'less', label: '<' }
                ]}
            ]
        },
        JSONPostProcessor: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
                { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
                { key: 'var', type: 'text', label: 'Names of created variables', default: '' },
                { key: 'json_path', type: 'text', label: 'JSON Path expressions', default: '' },
                { key: 'match_numbers', type: 'text', label: 'Match No.', default: '1' },
                { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
                { key: 'compute_concat', type: 'checkbox', label: 'Compute concatenation', default: false }
            ]
        },
        RegexExtractor: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
                { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
                { key: 'field_to_check', type: 'select', label: 'Field to check', default: 'body', options: FIELD_CHECK_OPTS },
                { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
                { key: 'regex', type: 'text', label: 'Regular Expression', default: '' },
                { key: 'template', type: 'text', label: 'Template', default: '$1$' },
                { key: 'match_number', type: 'text', label: 'Match No.', default: '1' },
                { key: 'default_value', type: 'text', label: 'Default Value', default: '' }
            ]
        },
        XPathExtractor: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
                { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
                { key: 'xpath_query', type: 'text', label: 'XPath Query', default: '' },
                { key: 'match_number', type: 'text', label: 'Match No.', default: '-1' },
                { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
                { key: 'validate_xml', type: 'checkbox', label: 'Validate XML', default: false }
            ]
        },
        BeanShellPreProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        BeanShellPostProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        JSR223PreProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS }
            ]
        },
        JSR223PostProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS }
            ]
        },
        UserParameters: {
            fields: [
                { key: 'names', type: 'patterns', label: '变量名 (每行一个)', default: [] },
                { key: 'thread_values', type: 'textarea', label: '线程值 (逗号分隔，每行对应一个变量)', default: '' }
            ]
        },
        HeaderManager: {
            fields: [
                { key: 'headers', type: 'kv', label: 'HTTP 信息头', default: [] }
            ]
        },
        Arguments: {
            fields: [
                { key: 'arguments', type: 'kv', label: '用户定义变量', default: [] }
            ]
        },
        ConfigTestElement: {
            fields: [
                { key: 'protocol', type: 'text', label: '协议 (protocol)', default: 'https' },
                { key: 'domain', type: 'text', label: '域名 (domain)', default: '' },
                { key: 'port', type: 'text', label: '端口 (port)', default: '' },
                { key: 'path', type: 'text', label: '路径 (path)', default: '' }
            ]
        },
        BackendListener: {
            fields: [
                { key: 'classname', type: 'text', label: '实现类 (classname)', default: 'org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient' },
                { key: 'influxdbUrl', type: 'text', label: 'Influx URL (influxdbUrl)', default: 'http://127.0.0.1:8086/write?db=jmeter' },
                { key: 'application', type: 'text', label: 'application（Grafana 主维度）', default: '' },
                { key: 'measurement', type: 'text', label: 'measurement', default: 'jmeter' },
                { key: 'eventTags', type: 'text', label: 'eventTags（env/scenario/build）', default: '' }
            ]
        },
        CounterConfig: {
            fields: [
                { key: 'variable_name', type: 'text', label: 'Counter Name', default: '' },
                { key: 'start', type: 'number', label: 'Start', default: 1 },
                { key: 'increment', type: 'number', label: 'Increment', default: 1 },
                { key: 'maximum', type: 'text', label: 'Maximum', default: '' },
                { key: 'format', type: 'text', label: 'Format', default: '' },
                { key: 'per_user', type: 'checkbox', label: 'Track counter independently for each user', default: true }
            ]
        },
﻿
        IfController: {
            fields: [
                { key: 'condition', type: 'textarea', label: '条件 (condition)', default: '' },
                { key: 'evaluate_all', type: 'checkbox', label: 'Evaluate for all children', default: false },
                { key: 'use_expression', type: 'checkbox', label: 'Interpret Condition as Variable Expression', default: true }
            ]
        },
        LoopController: {
            fields: [
                { key: 'loop_forever', type: 'checkbox', label: '永远循环', default: false },
                { key: 'loops', type: 'number', label: '循环次数 (-1=永远)', default: 1, min: -1 }
            ]
        },
        TransactionController: {
            fields: [
                { key: 'generate_parent_sample', type: 'checkbox', label: 'Generate parent sample', default: false },
                { key: 'include_timer_duration', type: 'checkbox', label: 'Include duration of timer', default: true }
            ]
        },
        GenericController: {
            fields: [{ key: 'notes', type: 'textarea', label: '说明', default: '' }]
        },
        RandomController: {
            fields: [
                { key: 'ignore_sub_controller_blocks', type: 'checkbox', label: 'Ignore sub-controller blocks', default: false }
            ]
        },

        XPathAssertion: {
            fields: [
                { key: 'xpath', type: 'textarea', label: 'XPath 表达式', default: '' },
                { key: 'negate', type: 'checkbox', label: '取反 (Negate)', default: false },
                { key: 'validate_xml', type: 'checkbox', label: '验证 XML', default: false }
            ]
        },
        XMLAssertion: {
            fields: [
                { key: 'xml', type: 'textarea', label: 'XML 文档', default: '' },
                { key: 'dtd', type: 'text', label: 'DTD', default: '' },
                { key: 'xpath', type: 'text', label: 'XPath', default: '' }
            ]
        },
        DurationAssertion: {
            fields: [
                { key: 'duration_ms', type: 'number', label: '最大耗时 (毫秒)', default: 0, min: 0 },
                { key: 'compare', type: 'select', label: '比较', default: 'less', options: [
                    { val: 'less', label: '<' }, { val: 'greater', label: '>' }, { val: 'equal', label: '=' }
                ]}
            ]
        },
        JMESPathAssertion: {
            fields: [
                { key: 'jmes_path', type: 'text', label: 'JMESPath 表达式', default: '' },
                { key: 'expected_value', type: 'text', label: '预期值', default: '' },
                { key: 'invert', type: 'checkbox', label: 'Invert', default: false }
            ]
        },
        JDBCPreProcessor: {
            fields: [
                { key: 'data_source', type: 'text', label: '数据源', default: '' },
                { key: 'query', type: 'textarea', label: 'SQL 查询', default: '' },
                { key: 'query_timeout', type: 'text', label: 'Query Timeout', default: '' },
                { key: 'query_type', type: 'select', label: 'Query Type', default: 'Select Statement', options: [
                    { val: 'Select Statement', label: 'Select Statement' },
                    { val: 'Update Statement', label: 'Update Statement' },
                    { val: 'Callable Statement', label: 'Callable Statement' }
                ]}
            ]
        },
        JDBCPostProcessor: {
            fields: [
                { key: 'data_source', type: 'text', label: '数据源', default: '' },
                { key: 'query', type: 'textarea', label: 'SQL 查询', default: '' },
                { key: 'variable_names', type: 'text', label: 'Variable Names', default: '' },
                { key: 'query_timeout', type: 'text', label: 'Query Timeout', default: '' }
            ]
        },
        WhileController: {
            fields: [
                { key: 'condition', type: 'textarea', label: '条件', default: '' }
            ]
        },
        ForEachController: {
            fields: [
                { key: 'input_val', type: 'text', label: '输入变量前缀', default: '' },
                { key: 'return_val', type: 'text', label: '输出变量名', default: '' },
                { key: 'use_separator', type: 'checkbox', label: '使用分隔符', default: true }
            ]
        },
        SummaryReport: {
            fields: [
                { key: 'filename', type: 'text', label: '文件名', default: '' },
                { key: 'log_errors_only', type: 'checkbox', label: '仅记录错误', default: false }
            ]
        },
        TableVisualizer: {
            fields: [
                { key: 'filename', type: 'text', label: '文件名', default: '' },
                { key: 'log_errors_only', type: 'checkbox', label: '仅记录错误', default: false }
            ]
        },

        DebugSampler: {
            fields: [
                { key: 'display_jmeter_variables', type: 'checkbox', label: 'Display JMeter variables', default: true },
                { key: 'display_jmeter_properties', type: 'checkbox', label: 'Display JMeter properties', default: false },
                { key: 'display_system_properties', type: 'checkbox', label: 'Display System properties', default: false }
            ]
        },
        ViewResultsFullVisualizer: {
            fields: [{ key: 'notes', type: 'textarea', label: '监听器说明', default: '' }]
        },
        StatVisualizer: {
            fields: [{ key: 'notes', type: 'textarea', label: '监听器说明', default: '' }]
        },
        CookieManager: {
            fields: [
                { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除 Cookie', default: true },
                { key: 'cookie_policy', type: 'select', label: 'Cookie Policy', default: 'standard', options: [
                    { val: 'standard', label: 'standard' },
                    { val: 'ignoreCookies', label: 'ignoreCookies' },
                    { val: 'netscape', label: 'netscape' }
                ]},
                { key: 'cookies', type: 'kv', label: 'Cookie (name/value)', default: [] }
            ]
        },
        AuthManager: {
            fields: [
                { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除授权', default: false },
                { key: 'authorizations', type: 'kv', label: '授权 (URL/username)', default: [] }
            ]
        },
        CacheManager: {
            fields: [
                { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除缓存', default: false },
                { key: 'use_expires', type: 'checkbox', label: 'Use Expires', default: true },
                { key: 'max_size', type: 'text', label: 'Max cache size (entries)', default: '5000' }
            ]
        },
        HTTPSamplerProxy: {
            fields: [
                { key: 'method', type: 'select', label: 'HTTP 方法', default: 'GET', options: [
                    { val: 'GET', label: 'GET' }, { val: 'POST', label: 'POST' },
                    { val: 'PUT', label: 'PUT' }, { val: 'DELETE', label: 'DELETE' },
                    { val: 'PATCH', label: 'PATCH' }, { val: 'HEAD', label: 'HEAD' }
                ]},
                { key: 'path', type: 'text', label: '路径 (path)', default: '' },
                { key: 'query', type: 'kv', label: '查询参数 (query)', default: [] },
                { key: 'body', type: 'textarea', label: 'Body', default: '' }
            ]
        },

        CSVDataSet: {
            fields: [
                { key: 'filename', type: 'text', label: 'Filename', default: '' },
                { key: 'variable_names', type: 'text', label: 'Variable Names', default: '' },
                { key: 'delimiter', type: 'text', label: 'Delimiter', default: ',' },
                { key: 'recycle', type: 'checkbox', label: 'Recycle on EOF', default: true },
                { key: 'stop_thread', type: 'checkbox', label: 'Stop thread on EOF', default: false },
                { key: 'share_mode', type: 'select', label: 'Sharing mode', default: 'all', options: [
                    { val: 'all', label: 'All threads' },
                    { val: 'group', label: 'Current thread group' },
                    { val: 'thread', label: 'Current thread' }
                ]}
            ]
        }
    };

    var CATEGORY_FALLBACK = {
        timer: [{ key: 'delay_ms', type: 'number', label: '延迟 (毫秒)', default: 300, min: 0 }],
        assertion: [{ key: 'notes', type: 'textarea', label: '说明 / 备注', default: '' }],
        preprocessor: [{ key: 'script', type: 'textarea', label: '脚本 / 配置', default: '' }],
        postprocessor: [{ key: 'script', type: 'textarea', label: '脚本 / 配置', default: '' }],
        config: [{ key: 'notes', type: 'textarea', label: '配置说明', default: '' }],
        listener: [{ key: 'notes', type: 'textarea', label: '监听器说明', default: '' }]
    };

    function getSchema(step) {
        if (!step) return { fields: [] };
        if (step.alias === 'ConfigTestElement' && step.guiclass === 'HttpDefaultsGui') {
            return ALIAS_SCHEMAS.ConfigTestElement;
        }
        if (step.alias && ALIAS_SCHEMAS[step.alias]) return ALIAS_SCHEMAS[step.alias];
        var Ext = global.JmsCatalogSchemaExtend;
        if (Ext && typeof Ext.getSchemaForAlias === 'function') {
            var extSchema = Ext.getSchemaForAlias(step);
            if (extSchema && extSchema.fields && extSchema.fields.length) return extSchema;
        }
        var cat = step.category || 'other';
        return { fields: CATEGORY_FALLBACK[cat] ? CATEGORY_FALLBACK[cat].slice() : [] };
    }

    function defaultProps(step) {
        var schema = getSchema(step);
        var props = { comments: '' };
        (schema.fields || []).forEach(function (f) {
            if (f.key === 'headers') props.headers = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'arguments') props.arguments = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'query') props.query = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'patterns' || f.key === 'names') props[f.key] = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'cookies' || f.key === 'authorizations') props[f.key] = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.type === 'checkbox') props[f.key] = !!f.default;
            else if (f.default != null) props[f.key] = f.default;
            else props[f.key] = f.type === 'number' ? 0 : '';
        });
        if (step && step.alias === 'BackendListener') {
            if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.defaultInfluxBackendProps === 'function') {
                var d = global.JmsPlanCatalogResolve.defaultInfluxBackendProps({});
                props.classname = d.classname;
                props.queue_size = d.queue_size;
                props.parameters = d.parameters;
                (d.parameters || []).forEach(function (p) {
                    if (p && p.key && p.key !== 'classname' && p.key !== 'queue_size') props[p.key] = p.value;
                });
            }
        }
        if (step && step.alias === 'ConfigTestElement' && step.guiclass === 'HttpDefaultsGui') {
            props.enabled = true;
            props.follow_redirects = true;
            props.auto_redirects = false;
            props.use_keepalive = true;
        }
        return props;
    }

    function propsForEditor(step) {
        var props = step && step.catalog_props
            ? JSON.parse(JSON.stringify(step.catalog_props))
            : defaultProps(step);
        if (step && step.alias === 'HeaderManager') {
            var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
            if (HN && typeof HN.normalizeHeaderProps === 'function') {
                props = HN.normalizeHeaderProps(props);
            } else if (props.headers != null && !Array.isArray(props.headers) && typeof props.headers === 'object') {
                props.headers = Object.keys(props.headers).map(function (k) {
                    return { key: k, name: k, value: props.headers[k] == null ? '' : String(props.headers[k]) };
                });
            }
        }
        if (step && (step.alias === 'HTTPSamplerProxy' || step.alias === 'HTTPSampler' || step.alias === 'HTTPSampler2')) {
            var QE = global.JmsHttpSamplerQueryEditorV1;
            if (QE && typeof QE.normalizeHttpPropsForEditor === 'function') {
                props = QE.normalizeHttpPropsForEditor(props);
            } else if (props.query != null && !Array.isArray(props.query) && typeof props.query === 'object') {
                props.query = Object.keys(props.query).map(function (k) {
                    return { key: k, name: k, value: props.query[k] == null ? '' : String(props.query[k]) };
                });
            } else if (!Array.isArray(props.query)) {
                props.query = [];
            }
        }
        if (step && step.alias === 'JSONPathAssertion') {
            var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
            if (JA && typeof JA.normalizeJsonAssertProps === 'function') {
                props = JA.normalizeJsonAssertProps(props);
            }
        }
        if (step && step.alias === 'BackendListener' && Array.isArray(props.parameters)) {
            props.parameters.forEach(function (p) {
                if (!p || !p.key || p.key === 'classname' || p.key === 'queue_size') return;
                props[p.key] = p.value == null ? '' : String(p.value);
            });
        }
        return props;
    }

    function persistEditorProps(step, props) {
        if (!step || !props) return props;
        if (step.alias === 'BackendListener') {
            var schema = getSchema(step);
            var paramMap = {};
            (props.parameters || []).forEach(function (p) {
                if (p && p.key) paramMap[p.key] = p.value == null ? '' : String(p.value);
            });
            (schema.fields || []).forEach(function (f) {
                if (!f || !f.key || f.key === 'classname') return;
                if (props[f.key] !== undefined) paramMap[f.key] = props[f.key] == null ? '' : String(props[f.key]);
            });
            var rows = Object.keys(paramMap).map(function (k) {
                return { key: k, value: paramMap[k] };
            });
            if (global.JmsBackendListenerCatalog && typeof global.JmsBackendListenerCatalog.normalizeConfig === 'function') {
                var cfg = global.JmsBackendListenerCatalog.normalizeConfig({
                    name: step.name,
                    comments: props.comments || '',
                    classname: props.classname,
                    queue_size: props.queue_size || '5000',
                    parameters: rows
                });
                return {
                    comments: cfg.comments,
                    classname: cfg.classname,
                    queue_size: cfg.queue_size,
                    parameters: cfg.parameters
                };
            }
            return {
                comments: props.comments || '',
                classname: props.classname,
                queue_size: props.queue_size || '5000',
                parameters: rows
            };
        }
        if (step.alias === 'JSONPathAssertion') {
            var JA2 = global.JmsJmxImportJsonAssertPropsNormalizeV1;
            if (JA2 && typeof JA2.toLegacyProps === 'function') {
                return JA2.toLegacyProps(props);
            }
            return {
                comments: props.comments || '',
                json_path: props.json_path || '',
                expected: props.expected_value == null ? '' : String(props.expected_value),
                additionally_assert_value: !!props.validate_json,
                is_regex: !!props.is_regex,
                expect_null: !!props.expect_null,
                invert: !!props.invert
            };
        }
        return props;
    }

    global.JmsCatalogElementEditorSchema = {
        getSchema: getSchema,
        defaultProps: defaultProps,
        propsForEditor: propsForEditor,
        persistEditorProps: persistEditorProps,
        ALIAS_SCHEMAS: ALIAS_SCHEMAS
    };
})(window);

/* ---- js/jms_catalog_editor_schema_jmeter_gui_v1.js ---- */
/**
 * JMeter 官方 GUI 字段 · 编辑器 schema 全量对齐（隔离补丁，不修改原 schema 文件）
 * 根因：ALIAS_SCHEMAS / schema_extend 将 BeanShell 误用 JSR223 风格（script+language），
 *       且 *PostProcessor/*PreProcessor 通配回退为 SCRIPT_FIELDS。
 */
(function (global) {
    'use strict';

    var LANG_OPTS = [
        { val: 'groovy', label: 'groovy' },
        { val: 'javascript', label: 'javascript' },
        { val: 'beanshell', label: 'beanshell' },
        { val: 'jython', label: 'jython' }
    ];

    var EXTRACT_APPLY_OPTS = [
        { val: 'main', label: 'Main sample only' },
        { val: 'sub', label: 'Sub-samples only' },
        { val: 'all', label: 'Main sample and sub-samples' },
        { val: 'variable', label: 'JMeter Variable Name to use' }
    ];

    function cloneFields(list) {
        return (list || []).map(function (f) {
            var o = {};
            Object.keys(f).forEach(function (k) { o[k] = f[k]; });
            if (Array.isArray(f.options)) o.options = f.options.slice();
            return o;
        });
    }

    /** TestBeanGUI · BeanShell 族（无 language） */
    var BEANSHELL_GUI = [
        { key: 'reset_interpreter', type: 'checkbox', label: 'Reset bsh.Interpreter before each call', default: false },
        { key: 'parameters', type: 'text', label: 'Parameters (=> String Parameters and String []bsh.args)', default: '' },
        { key: 'filename', type: 'text', label: 'Script file (overrides script) · File Name', default: '' },
        { key: 'script', type: 'textarea', label: 'Script (variables: ctx vars props prev data log)', default: '' }
    ];

    /** TestBeanGUI · JSR223 族 */
    var JSR223_GUI = [
        { key: 'cache_compiled', type: 'checkbox', label: 'Cache compiled script if available', default: true },
        { key: 'filename', type: 'text', label: 'Script file (overrides script) · File Name', default: '' },
        { key: 'parameters', type: 'text', label: 'Parameters (=> String Parameters and String []args)', default: '' },
        { key: 'script', type: 'textarea', label: 'Script', default: '' },
        { key: 'language', type: 'select', label: 'Script language (scriptLanguage)', default: 'groovy', options: LANG_OPTS }
    ];

    /** BSF 族 */
    var BSF_GUI = [
        { key: 'language', type: 'select', label: 'Script language', default: 'beanshell', options: LANG_OPTS },
        { key: 'parameters', type: 'text', label: 'Parameters', default: '' },
        { key: 'filename', type: 'text', label: 'Script file · File Name', default: '' },
        { key: 'script', type: 'textarea', label: 'Script', default: '' }
    ];

    var JSON_PATH_ASSERTION_GUI = [
        { key: 'json_path', type: 'text', label: 'JSON Path', default: '' },
        { key: 'additionally_assert_value', type: 'checkbox', label: 'Additionally assert value', default: false },
        { key: 'expected', type: 'text', label: 'Expected Value', default: '' },
        { key: 'is_regex', type: 'checkbox', label: 'Additionally assert value is regex', default: false },
        { key: 'expect_null', type: 'checkbox', label: 'Expect null', default: false },
        { key: 'invert', type: 'checkbox', label: 'Invert assertion', default: false }
    ];

    var JMES_PATH_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Name of created variable', default: '' },
        { key: 'jmes_path', type: 'text', label: 'JMES Path expressions', default: '' },
        { key: 'match_numbers', type: 'text', label: 'Match No.', default: '0' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' }
    ];

    var BOUNDARY_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
        { key: 'left_boundary', type: 'text', label: 'Left Boundary', default: '' },
        { key: 'right_boundary', type: 'text', label: 'Right Boundary', default: '' },
        { key: 'match_number', type: 'text', label: 'Match No.', default: '1' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
        { key: 'use_headers', type: 'checkbox', label: 'Use Headers', default: false }
    ];

    var HTML_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
        { key: 'expr', type: 'text', label: 'CSS/JQuery selector', default: '' },
        { key: 'attribute', type: 'text', label: 'Attribute', default: '' },
        { key: 'match_number', type: 'text', label: 'Match No.', default: '0' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
        { key: 'extract_attribute', type: 'checkbox', label: 'Extract attribute', default: false },
        { key: 'use_empty', type: 'checkbox', label: 'Use empty default value', default: false }
    ];

    var XPATH_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
        { key: 'xpath_query', type: 'text', label: 'XPath Query', default: '' },
        { key: 'match_number', type: 'text', label: 'Match No.', default: '-1' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
        { key: 'validate_xml', type: 'checkbox', label: 'Validate XML', default: false }
    ];

    var DEBUG_POST_PROCESSOR_GUI = [
        { key: 'notes', type: 'textarea', label: '说明（Debug PostProcessor 在运行时输出取样器属性，无额外配置项）', default: '' }
    ];

    var JMX_FRAGMENT_GUI = [
        { key: 'jmx_fragment', type: 'textarea', label: 'JMX 片段 (高级)', default: '' }
    ];

    var BEANSHELL_ALIASES = [
        'BeanShellPostProcessor', 'BeanShellPreProcessor', 'BeanShellTimer',
        'BeanShellAssertion', 'BeanShellSampler', 'BeanShellListener'
    ];

    var JSR223_ALIASES = [
        'JSR223PostProcessor', 'JSR223PreProcessor', 'JSR223Timer',
        'JSR223Assertion', 'JSR223Sampler', 'JSR223Listener'
    ];

    var BSF_ALIASES = [
        'BSFPostProcessor', 'BSFPreProcessor', 'BSFTimer',
        'BSFAssertion', 'BSFSampler', 'BSFListener'
    ];

    var GUI_OVERRIDES = {};

    function setOverride(alias, fields) {
        GUI_OVERRIDES[alias] = { fields: cloneFields(fields) };
    }

    BEANSHELL_ALIASES.forEach(function (a) { setOverride(a, BEANSHELL_GUI); });
    JSR223_ALIASES.forEach(function (a) { setOverride(a, JSR223_GUI); });
    BSF_ALIASES.forEach(function (a) { setOverride(a, BSF_GUI); });
    setOverride('JSONPathAssertion', JSON_PATH_ASSERTION_GUI);
    setOverride('XPathExtractor', XPATH_EXTRACTOR_GUI);
    setOverride('JMESPathExtractor', JMES_PATH_EXTRACTOR_GUI);
    setOverride('BoundaryExtractor', BOUNDARY_EXTRACTOR_GUI);
    setOverride('HtmlExtractor', HTML_EXTRACTOR_GUI);
    setOverride('DebugPostProcessor', DEBUG_POST_PROCESSOR_GUI);

    function resolveOverride(step) {
        if (!step) return null;
        var alias = step.alias || '';
        if (!alias) return null;
        if (GUI_OVERRIDES[alias]) return GUI_OVERRIDES[alias];
        if (/^BeanShell/.test(alias)) return { fields: cloneFields(BEANSHELL_GUI) };
        if (/^JSR223/.test(alias)) return { fields: cloneFields(JSR223_GUI) };
        if (/^BSF/.test(alias)) return { fields: cloneFields(BSF_GUI) };
        return null;
    }

    function fieldKeys(fields) {
        return (fields || []).map(function (f) { return f && f.key; }).filter(Boolean).join(',');
    }

    function isWrongScriptFallback(alias, fields) {
        if (!alias || !fields || !fields.length) return false;
        if (/^BeanShell|^BSF|^JSR223/.test(alias)) return false;
        var keys = fieldKeys(fields);
        if ((/PostProcessor$/.test(alias) || /PreProcessor$/.test(alias)) &&
            keys.indexOf('script') >= 0 && keys.indexOf('language') >= 0) {
            return true;
        }
        if (/Timer$/.test(alias) && keys.indexOf('script') >= 0 && keys.indexOf('language') >= 0 &&
            alias !== 'JSR223Timer' && alias !== 'BSFTimer' && alias !== 'BeanShellTimer') {
            return true;
        }
        return false;
    }

    function normalizePropsForEditor(step, props) {
        if (!step || !props) return props;
        var alias = step.alias || '';
        if (/^BeanShell/.test(alias)) {
            delete props.language;
            delete props.scriptLanguage;
        }
        if (/^JSR223/.test(alias)) {
            if (!props.language && props.scriptLanguage) props.language = props.scriptLanguage;
            if (props.cache_compiled === undefined) {
                if (props.cache_key === 'false' || props.cache_compiled === false) props.cache_compiled = false;
                else props.cache_compiled = true;
            }
        }
        if (alias === 'JSONPathAssertion') {
            if (props.expected == null && props.expected_value != null) props.expected = props.expected_value;
            if (props.additionally_assert_value == null && props.validate_json != null) {
                props.additionally_assert_value = !!props.validate_json;
            }
        }
        return props;
    }

    function normalizePersistProps(step, props) {
        if (!step || !props) return props;
        var alias = step.alias || '';
        var out = Object.assign({}, props);
        if (/^BeanShell/.test(alias)) {
            delete out.language;
            delete out.scriptLanguage;
        }
        if (/^JSR223/.test(alias)) {
            if (out.language && !out.scriptLanguage) out.scriptLanguage = out.language;
            delete out.cache_key;
        }
        if (alias === 'JSONPathAssertion') {
            delete out.expected_value;
            delete out.validate_json;
        }
        return out;
    }

    function patchEditorSchema() {
        var S = global.JmsCatalogElementEditorSchema;
        if (!S || S._jmeterGuiPatchV1) return;
        S._jmeterGuiPatchV1 = true;

        var origGetSchema = S.getSchema;
        S.getSchema = function (step) {
            if (!step) return { fields: [] };
            if (step.alias === 'ConfigTestElement' && step.guiclass === 'HttpDefaultsGui') {
                return origGetSchema.call(S, step);
            }
            var ov = resolveOverride(step);
            if (ov) return ov;
            var schema = origGetSchema.call(S, step);
            if (isWrongScriptFallback(step.alias, schema && schema.fields)) {
                return { fields: cloneFields(JMX_FRAGMENT_GUI) };
            }
            return schema;
        };

        var origProps = S.propsForEditor;
        S.propsForEditor = function (step) {
            return normalizePropsForEditor(step, origProps.call(S, step));
        };

        var origPersist = S.persistEditorProps;
        S.persistEditorProps = function (step, props) {
            return origPersist.call(S, step, normalizePersistProps(step, props));
        };
    }

    function patchSchemaExtend() {
        var Ext = global.JmsCatalogSchemaExtend;
        if (!Ext || Ext._jmeterGuiPatchV1) return;
        Ext._jmeterGuiPatchV1 = true;

        var origGet = Ext.getSchemaForAlias;
        Ext.getSchemaForAlias = function (step) {
            if (!step) return { fields: [] };
            var ov = resolveOverride(step);
            if (ov) {
                var patched = { fields: ov.fields.slice() };
                patched.fields.unshift({ key: 'comments', type: 'textarea', label: '注释', default: '' });
                var cat = step.category || 'other';
                if (cat === 'other' || cat === 'listener') {
                    patched.fields.push({ key: 'jmx_fragment', type: 'textarea', label: 'JMX 片段 (高级)', default: '' });
                }
                return patched;
            }
            var schema = origGet.call(Ext, step);
            if (isWrongScriptFallback(step.alias, schema && schema.fields)) {
                var fixed = { fields: [{ key: 'comments', type: 'textarea', label: '注释', default: '' }] };
                fixed.fields = fixed.fields.concat(cloneFields(JMX_FRAGMENT_GUI));
                return fixed;
            }
            return schema;
        };
    }

    function boot() {
        patchEditorSchema();
        patchSchemaExtend();
    }

    global.JmsCatalogEditorSchemaJmeterGuiV1 = {
        resolveOverride: resolveOverride,
        GUI_OVERRIDES: GUI_OVERRIDES,
        BEANSHELL_GUI: BEANSHELL_GUI,
        JSR223_GUI: JSR223_GUI,
        patch: boot
    };

    boot();
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_post_add.js ---- */
/**
 * JMeter catalog · 添加后刷新 UI（仅在用户保存后调用）
 */
(function (global) {
    'use strict';

    function sid(v) {
        if (global.JmsCatalogRefresh && typeof global.JmsCatalogRefresh.sid === 'function') {
            return global.JmsCatalogRefresh.sid(v);
        }
        return v == null ? '' : String(v);
    }

    function findTg(model, planId, tgId) {
        if (global.JmsCatalogContextAppend && typeof global.JmsCatalogContextAppend.findTg === 'function') {
            return global.JmsCatalogContextAppend.findTg(model, planId, tgId);
        }
        return null;
    }

    function assignTimelineOrder(vb, planId, tgId, step) {
        if (!vb || !step) return;
        var tg = findTg(vb.getModel(), planId, tgId);
        if (!tg) return;
        var TL = global.JmsTgDetailTimeline;
        if (TL && typeof TL.assignAppendTimelineOrder === 'function') {
            TL.assignAppendTimelineOrder(tg, step);
        }
    }

    function assignHttpMountKey(step, childIndex) {
        if (!step || childIndex == null) return;
        var TL = global.JmsHttpMountTimeline;
        if (TL && typeof TL.assignAppendMountKey === 'function') {
            TL.assignAppendMountKey(step, 'cat:' + childIndex);
        }
    }

    function refreshAfterSave(vb, planId, tgId, step, insertCtx) {
        insertCtx = insertCtx || {};
        if (!vb || !step) return;

        if (insertCtx.context === 'test_plan') {
            if (typeof vb.triggerRender === 'function') vb.triggerRender();
            else if (typeof vb.scheduleRender === 'function') vb.scheduleRender();
            return;
        }

        if (insertCtx.context !== 'sampler' && !insertCtx.httpMount && insertCtx.context !== 'sampler_child') {
            assignTimelineOrder(vb, planId, tgId, step);
        }

        if (global.JmsCatalogRefresh && typeof global.JmsCatalogRefresh.refreshStepsArea === 'function') {
            global.JmsCatalogRefresh.refreshStepsArea(vb, planId, tgId);
        } else if (typeof vb.triggerRender === 'function') {
            vb.triggerRender();
        } else if (typeof vb.scheduleRender === 'function') {
            vb.scheduleRender();
        }

        var samplerId = insertCtx.parentStepId;
        var isHttpChild = insertCtx.httpMount || insertCtx.context === 'sampler_child' || insertCtx.context === 'sampler';
        if (isHttpChild && samplerId) {
            global.setTimeout(function () {
                if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.selectHttp === 'function') {
                    global.JmsHttpContextUi.selectHttp(planId, tgId, samplerId);
                }
            }, 60);
        }

        if (global.JmsCatalogCardToggle && typeof global.JmsCatalogCardToggle.applyState === 'function') {
            global.setTimeout(function () {
                var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + sid(planId) + '"]');
                if (card) global.JmsCatalogCardToggle.applyState(card);
            }, 80);
        }
    }

    /** @deprecated 仅兼容旧调用；新流程请用 refreshAfterSave */
    function refreshAfterAdd(vb, planId, tgId, step, insertCtx) {
        refreshAfterSave(vb, planId, tgId, step, insertCtx);
    }

    global.JmsCatalogPostAdd = {
        refreshAfterSave: refreshAfterSave,
        refreshAfterAdd: refreshAfterAdd,
        assignTimelineOrder: assignTimelineOrder,
        assignHttpMountKey: assignHttpMountKey
    };
})(window);

/* ---- js/jms_catalog_card_toggle.js ---- */
/**
 * JMeter catalog · 卡片展开/收缩（所有 catalog 卡片，对齐逻辑控制器 / HTTP 行）
 */
(function (global) {
    'use strict';

    var collapsed = Object.create(null);
    var CARD_SEL = '.jms-catalog-card';
    var HEAD_SEL = '.jms-catalog-card__head';

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isExpandableCard(card) {
        return !!(card && card.classList.contains('jms-catalog-card--expandable'));
    }

    function isCardCollapsed(stepId) {
        if (Object.prototype.hasOwnProperty.call(collapsed, stepId)) return !!collapsed[stepId];
        return isTreeView();
    }

    function applyCollapseClass(card, isCollapsed) {
        if (!isExpandableCard(card)) return;
        card.classList.toggle('jms-catalog-card--collapsed', isCollapsed);
        card.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }


    function collapseDescendants(card) {
        if (!card) return;
        var body = card.querySelector(':scope > .jms-catalog-card__body');
        if (!body) return;
        body.querySelectorAll('.jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card').forEach(function (logic) {
            var L = global.JmsLogicCtrlCardToggle;
            if (L && typeof L.collapseCard === 'function') {
                L.collapseCard(logic);
            }
        });
        body.querySelectorAll('.jms-catalog-card--expandable').forEach(function (cat) {
            if (cat === card) return;
            var csid = cat.getAttribute('data-step-id');
            if (!csid) return;
            collapsed[csid] = true;
            applyCollapseClass(cat, true);
            collapseDescendants(cat);
        });

    }

    function applyState(planCard) {
        if (!planCard) return;
        planCard.querySelectorAll(CARD_SEL + '.jms-catalog-card--expandable').forEach(function (card) {
            var stepId = card.getAttribute('data-step-id');
            if (!stepId) return;
            applyCollapseClass(card, isCardCollapsed(stepId));
        });
    }

    function toggleCard(card) {
        if (!isExpandableCard(card)) return;
        var stepId = card.getAttribute('data-step-id');
        if (!stepId) return;
        collapsed[stepId] = !isCardCollapsed(stepId);
        applyCollapseClass(card, !!collapsed[stepId]);
        if (collapsed[stepId]) collapseDescendants(card);
    }

    function isSelectionBlocked(target) {
        if (!target || !target.closest) return true;
        return !!target.closest(
            'button, a, input, select, textarea, label, [role="menuitem"],' +
            ' .jms-tree-drag-handle, .jms-btn-edit-catalog, .jms-btn-del-catalog,' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-http-context, .jms-http-card, .jms-http-mount-children, .jms-tree-node--http-mount'
        );
    }

    function resolveCardFromClick(target) {
        if (!target || !target.closest || isSelectionBlocked(target)) return null;
        var head = target.closest(HEAD_SEL);
        if (!head) return null;
        var card = head.closest(CARD_SEL);
        return isExpandableCard(card) ? card : null;
    }

    function stopPassiveClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
    }

    function onRootClick(ev) {
        if (global.JmsCatalogSamplerCtrlExpandUi) return;
        if (!isTreeView()) return;
        var card = resolveCardFromClick(ev.target);
        if (!card) return;
        stopPassiveClick(ev);
        ev.stopPropagation();
        toggleCard(card);
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsCatalogCardToggleBound === '1') return;
        global.document.body.dataset.jmsCatalogCardToggleBound = '1';
        global.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    function collapseCard(card) {
        if (!isExpandableCard(card)) return;
        var stepId = card.getAttribute('data-step-id');
        if (!stepId) return;
        collapsed[stepId] = true;
        applyCollapseClass(card, true);
        collapseDescendants(card);
    }

    global.JmsCatalogCardToggle = {
        applyState: applyState,
        toggleCard: toggleCard,
        collapseCard: collapseCard,
        isCardCollapsed: isCardCollapsed
    };
})(window);

/* ---- js/jms_catalog_element_editor_ui.js ---- */
/**
 * JMeter catalog_element · 配置弹窗（保存后才写入步骤树）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'jms-catalog-element-editor-modal';
    var _pending = null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function vb() { return global.JmsVisualBuilder; }

    function schemaApi() { return global.JmsCatalogElementEditorSchema; }

    function appendApi() { return global.JmsCatalogContextAppend; }

    function bridgeApi() { return global.JmsStudioCatalogBridge; }

    function findStepInList(list, stepId) {
        if (appendApi() && typeof appendApi().findStepInList === 'function') {
            return appendApi().findStepInList(list, stepId);
        }
        if (!list || !stepId) return null;
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === want) return s;
            if (Array.isArray(s.children)) {
                var n = findStepInList(s.children, stepId);
                if (n) return n;
            }
        }
        return null;
    }

    function findPlan(model, planId) {
        if (appendApi() && typeof appendApi().findPlan === 'function') {
            return appendApi().findPlan(model, planId);
        }
        return (model.test_plans || []).filter(function (p) { return p && String(p.id) === String(planId); })[0];
    }

    function findTg(model, planId, tgId) {
        if (appendApi() && typeof appendApi().findTg === 'function') {
            return appendApi().findTg(model, planId, tgId);
        }
        return null;
    }

    function locatePlanCatalogStep(model, stepId) {
        if (!model || !stepId) return { step: null, list: null, index: -1 };
        var list = model.plan_catalog_items || [];
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            if (list[i] && String(list[i].id) === want) {
                return { step: list[i], list: list, index: i };
            }
        }
        return { step: null, list: list, index: -1 };
    }

    function locateStep(model, planId, tgId, stepId, mount) {
        mount = mount || {};
        var tg = findTg(model, planId, tgId);
        if (!tg || !stepId) return { tg: tg, step: null, host: null, list: null, index: -1 };
        if (mount.samplerStepId && global.JmsCatalogSamplerChildren) {
            var sampler = global.JmsCatalogSamplerChildren.findSamplerStep(model, planId, tgId, mount.samplerStepId);
            var list = sampler && sampler.catalog_hash_children;
            if (list) {
                for (var i = 0; i < list.length; i += 1) {
                    if (list[i] && String(list[i].id) === String(stepId)) {
                        return { tg: tg, step: list[i], host: sampler, list: list, index: i };
                    }
                }
            }
        }
        var step = findStepInList(tg.steps, stepId);
        return { tg: tg, step: step, host: tg, list: tg.steps, index: -1 };
    }

    function buildDraftStep(comp, catalogState) {
        if (bridgeApi() && typeof bridgeApi().buildCatalogStep === 'function') {
            return bridgeApi().buildCatalogStep(comp, (catalogState && catalogState.templates) || {});
        }
        return {
            id: 'cat_' + Math.random().toString(36).slice(2, 10),
            type: 'catalog_element',
            name: (comp.label_zh || comp.alias) + ' ' + Math.floor(Math.random() * 900 + 100),
            enabled: true,
            alias: comp.alias,
            category: comp.category || 'other',
            label_zh: comp.label_zh || comp.alias,
            container: !!comp.container
        };
    }

    function categoryBadge(step) {
        var cat = (step && step.category) || 'other';
        if (cat === 'listener') return 'LIS';
        if (cat === 'config') return 'CFG';
        return 'CAT';
    }

    function ensureModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal) return modal;
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-catalog-editor-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML =
            '<div class="jms-modal__backdrop" data-catalog-editor-close="1"></div>' +
            '<div class="jms-modal__panel jms-pcat-editor-panel" role="dialog" aria-modal="true">' +
            '<header class="jms-modal__head jms-pcat-editor__head">' +
            '<div class="jms-pcat-editor__head-main">' +
            '<span class="jms-pcat-editor__icon" data-catalog-editor-icon aria-hidden="true">P</span>' +
            '<div class="jms-pcat-editor__titles">' +
            '<span class="jms-pcat-editor__badge" data-catalog-editor-badge>PLAN</span>' +
            '<h3 class="jms-modal__title" data-catalog-editor-title>配置元件</h3>' +
            '<p class="jms-pcat-editor__alias" data-catalog-editor-alias></p>' +
            '</div></div>' +
            '<button type="button" class="jms-modal__close jms-pcat-editor__close" data-catalog-editor-close="1" aria-label="关闭">×</button>' +
            '</header>' +
            '<div class="jms-modal__body jms-pcat-editor__body">' +
            '<div class="jms-pcat-editor__sheet">' +
            '<div class="jms-pcat-editor__row jms-pcat-editor__row--meta">' +
            '<div class="jms-field jms-pcat-editor__field jms-pcat-editor__field--name"><label>名称</label><input type="text" data-catalog-editor-name /></div>' +
            '<label class="jms-pcat-editor__chip jms-pcat-editor__chip--enabled"><input type="checkbox" data-catalog-editor-enabled checked /><span>启用</span></label>' +
            '</div>' +
            '<div class="jms-field jms-pcat-editor__field"><label>注释</label><input type="text" data-catalog-editor-comments placeholder="可选说明" /></div>' +
            '<div class="jms-pcat-editor__dynamic" data-catalog-editor-dynamic></div>' +
            '</div></div>' +
            '<footer class="jms-modal__foot jms-pcat-editor__foot">' +
            '<button type="button" class="jms-btn-ghost jms-pcat-editor__btn jms-pcat-editor__btn--ghost" data-catalog-editor-close="1">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-pcat-editor__btn jms-pcat-editor__btn--primary" data-catalog-editor-save="1">保存</button>' +
            '</footer></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target.closest('[data-catalog-editor-close]')) closeModal(true);
            if (ev.target.closest('[data-catalog-editor-save]')) saveModal();
        });
        var dyn = modal.querySelector('[data-catalog-editor-dynamic]');
        if (dyn) {
            dyn.addEventListener('click', function (ev) {
                var addBtn = ev.target.closest('.jms-catalog-kv-add');
                if (addBtn) {
                    var key = addBtn.getAttribute('data-kv-key');
                    var list = dyn.querySelector('.jms-catalog-kv-list[data-key="' + key + '"]');
                    if (list) {
                        var row = global.document.createElement('div');
                        row.className = 'jms-catalog-kv-row';
                        row.innerHTML = '<input type="text" data-kv-key placeholder="Name" />' +
                            '<input type="text" data-kv-val placeholder="Value" />' +
                            '<button type="button" class="jms-btn-ghost jms-catalog-kv-del" title="删除">×</button>';
                        list.appendChild(row);
                    }
                    return;
                }
                var delBtn = ev.target.closest('.jms-catalog-kv-del');
                if (delBtn) {
                    var r = delBtn.closest('.jms-catalog-kv-row');
                    if (r) r.remove();
                }
            });
        }
        return modal;
    }

    function field(modal, sel) {
        return modal.querySelector(sel);
    }

    function defaultProps(step) {
        var S = schemaApi();
        if (S && typeof S.defaultProps === 'function') return S.defaultProps(step);
        return { comments: '' };
    }

    function getSchema(step) {
        var S = schemaApi();
        if (S && typeof S.getSchema === 'function') return S.getSchema(step);
        return { fields: [] };
    }

    function renderDynamicFields(container, step, props) {
        container.innerHTML = '';
        var schema = getSchema(step);
        (schema.fields || []).forEach(function (f) {
            var wrap = global.document.createElement('div');
            wrap.className = 'jms-field';
            wrap.setAttribute('data-field-key', f.key);
            var val = props[f.key];
            if (f.type === 'checkbox') {
                wrap.innerHTML = '<label><input type="checkbox" data-dyn-input="1" data-key="' + esc(f.key) + '" /> ' + esc(f.label) + '</label>';
                var cb = wrap.querySelector('input');
                if (cb) cb.checked = !!val;
            } else if (f.type === 'select') {
                var opts = (f.options || []).map(function (o) {
                    var sel = String(val) === String(o.val) ? ' selected' : '';
                    return '<option value="' + esc(o.val) + '"' + sel + '>' + esc(o.label) + '</option>';
                }).join('');
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><select data-dyn-input="1" data-key="' + esc(f.key) + '">' + opts + '</select>';
            } else if (f.type === 'textarea') {
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><textarea data-dyn-input="1" data-key="' + esc(f.key) + '"></textarea>';
                wrap.querySelector('textarea').value = val != null ? val : '';
            } else if (f.type === 'patterns') {
                var lines = Array.isArray(val) ? val.join('\n') : (val || '');
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><textarea data-dyn-input="1" data-key="' + esc(f.key) + '" data-field-type="patterns"></textarea>';
                wrap.querySelector('textarea').value = lines;
            } else if (f.type === 'kv') {
                var rows = Array.isArray(val) ? val : [];
                var kvHtml = rows.map(function (row, idx) {
                    return '<div class="jms-catalog-kv-row" data-kv-index="' + idx + '">' +
                        '<input type="text" data-kv-key placeholder="Name" value="' + esc(row.name || row.key || '') + '" />' +
                        '<input type="text" data-kv-val placeholder="Value" value="' + esc(row.value || '') + '" />' +
                        '<button type="button" class="jms-btn-ghost jms-catalog-kv-del" title="删除">×</button></div>';
                }).join('');
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><div class="jms-catalog-kv-list" data-key="' + esc(f.key) + '">' +
                    kvHtml + '</div><button type="button" class="jms-btn-ghost jms-catalog-kv-add" data-kv-key="' + esc(f.key) + '">+ 添加</button>';
            } else {
                var minAttr = f.min != null ? ' min="' + f.min + '"' : '';
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><input type="' + (f.type === 'number' ? 'number' : 'text') + '" data-dyn-input="1" data-key="' + esc(f.key) + '"' + minAttr + ' />';
                var inp = wrap.querySelector('input');
                if (inp) inp.value = val != null ? val : (f.default != null ? f.default : '');
            }
            container.appendChild(wrap);
        });
    }

    function readDynamicProps(container, step) {
        var schema = getSchema(step);
        var props = {};
        (schema.fields || []).forEach(function (f) {
            if (f.type === 'kv') {
                var list = container.querySelector('.jms-catalog-kv-list[data-key="' + f.key + '"]');
                var rows = [];
                if (list) {
                    list.querySelectorAll('.jms-catalog-kv-row').forEach(function (row) {
                        var k = row.querySelector('[data-kv-key]');
                        var v = row.querySelector('[data-kv-val]');
                        var name = k && k.value.trim();
                        if (!name) return;
                        rows.push({ name: name, value: v ? v.value : '' });
                    });
                }
                props[f.key] = rows;
                return;
            }
            var el = container.querySelector('[data-dyn-input="1"][data-key="' + f.key + '"]');
            if (!el) return;
            if (f.type === 'checkbox') props[f.key] = !!el.checked;
            else if (f.type === 'number') props[f.key] = Number(el.value) || 0;
            else if (f.type === 'patterns') {
                props[f.key] = String(el.value || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
            } else props[f.key] = el.value;
        });
        return props;
    }

    function applyFormToStep(modal, step) {
        step.name = field(modal, '[data-catalog-editor-name]').value.trim() || step.name;
        step.enabled = field(modal, '[data-catalog-editor-enabled]').checked;
        if (!step.catalog_props) step.catalog_props = defaultProps(step);
        step.catalog_props.comments = field(modal, '[data-catalog-editor-comments]').value.trim();
        var dyn = readDynamicProps(field(modal, '[data-catalog-editor-dynamic]'), step);
        Object.keys(dyn).forEach(function (k) { step.catalog_props[k] = dyn[k]; });
        var S = schemaApi();
        if (S && typeof S.persistEditorProps === 'function') {
            step.catalog_props = S.persistEditorProps(step, step.catalog_props);
        }
        return step;
    }

    function editorProps(step) {
        var S = schemaApi();
        if (S && typeof S.propsForEditor === 'function') return S.propsForEditor(step);
        return step.catalog_props || defaultProps(step);
    }

    function syncPlanSceneFields(visual, step) {
        if (!visual || !step || step.scope !== 'plan_catalog') return;
        var R = global.JmsPlanCatalogResolve;
        if (!R) return;
        var isScene = (typeof R.isHttpDefaultsItem === 'function' && R.isHttpDefaultsItem(step)) ||
            (typeof R.isBackendListenerItem === 'function' && R.isBackendListenerItem(step));
        if (isScene && typeof R.syncSceneFieldsOntoModel === 'function') {
            R.syncSceneFieldsOntoModel(visual.getModel());
        }
    }

    function fillForm(modal, step, isCreate) {
        var props = editorProps(step);
        if (!step.catalog_props) step.catalog_props = props;
        field(modal, '[data-catalog-editor-title]').textContent = (isCreate ? '添加 · ' : '配置 · ') + (step.label_zh || step.alias);
        field(modal, '[data-catalog-editor-alias]').textContent = (step.alias || '') + ' · ' + (step.category || 'other');
        var badge = field(modal, '[data-catalog-editor-badge]');
        if (badge) badge.textContent = categoryBadge(step);
        var icon = field(modal, '[data-catalog-editor-icon]');
        if (icon) icon.textContent = categoryBadge(step).slice(0, 1);
        field(modal, '[data-catalog-editor-name]').value = step.name || '';
        field(modal, '[data-catalog-editor-enabled]').checked = step.enabled !== false;
        field(modal, '[data-catalog-editor-comments]').value = props.comments || '';
        renderDynamicFields(field(modal, '[data-catalog-editor-dynamic]'), step, props);
    }

    function closeModal(fromCancel) {
        var modal = global.document.getElementById(MODAL_ID);
        if (fromCancel && _pending && _pending.mode === 'create') {
            _pending = null;
        }
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-mode');
        modal.removeAttribute('data-plan-level');
    }

    function commitPendingStep(modal) {
        if (!_pending || _pending.mode !== 'create') return null;
        var visual = vb();
        if (!visual) return null;
        var step = applyFormToStep(modal, Object.assign({}, _pending.draft));
        var ctx = Object.assign({}, _pending.insertCtx || {});
        var created = null;
        var isSamplerChild = ctx.httpMount || ctx.context === 'sampler' || ctx.context === 'sampler_child';

        var isPlanLevel = ctx.context === 'test_plan';

        if (isPlanLevel && global.JmsPlanCatalogAppend &&
            typeof global.JmsPlanCatalogAppend.appendPlanCatalogItem === 'function') {
            var planRes = global.JmsPlanCatalogAppend.appendPlanCatalogItem(visual, step, ctx);
            if (planRes && planRes.ok) {
                created = planRes.step;
            }
        } else if (isSamplerChild && global.JmsCatalogSamplerChildren &&
            typeof global.JmsCatalogSamplerChildren.appendUnderSampler === 'function') {
            created = global.JmsCatalogSamplerChildren.appendUnderSampler(
                visual, ctx.planId, ctx.tgId, ctx.parentStepId, step
            );
            if (created && global.JmsCatalogPostAdd && typeof global.JmsCatalogPostAdd.assignHttpMountKey === 'function') {
                var sampler = global.JmsCatalogSamplerChildren.findSamplerStep(
                    visual.getModel(), ctx.planId, ctx.tgId, ctx.parentStepId
                );
                if (sampler && sampler.catalog_hash_children) {
                    global.JmsCatalogPostAdd.assignHttpMountKey(
                        sampler, sampler.catalog_hash_children.length - 1
                    );
                }
            }
        } else if (ctx.controllerMount && ctx.parentStepId) {
            var TreeAppend = global.JmsCatalogControllerTreeChildAppend;
            if (TreeAppend && typeof TreeAppend.isTreeChild === 'function' && TreeAppend.isTreeChild(step) &&
                typeof TreeAppend.append === 'function') {
                created = TreeAppend.append(visual, step, ctx);
                if (created) {
                    ctx = TreeAppend.normalizeTreeCtx ? TreeAppend.normalizeTreeCtx(ctx) : Object.assign({}, ctx, { context: 'controller' });
                }
            } else if (global.JmsCatalogSamplerChildren &&
                typeof global.JmsCatalogSamplerChildren.appendUnderMountHost === 'function') {
                created = global.JmsCatalogSamplerChildren.appendUnderMountHost(
                    visual, ctx.planId, ctx.tgId, ctx.parentStepId, step
                );
                if (created) {
                    var hostStep = global.JmsCatalogSamplerChildren.findMountHostStep(
                        visual.getModel(), ctx.planId, ctx.tgId, ctx.parentStepId
                    );
                    if (hostStep && global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.hashMountKey === 'function') {
                        var hashIdx = (hostStep.catalog_hash_children || []).length - 1;
                        var mountKey = global.JmsMountCatalogBridge.hashMountKey(created, hashIdx);
                        var Hm = global.JmsIfMountSaveHelper;
                        if (Hm && typeof Hm.notifyMountAdded === 'function') {
                            Hm.notifyMountAdded(hostStep, mountKey);
                        }
                    }
                    ctx.httpMount = true;
                    ctx.context = 'sampler_child';
                }
            }
        } else if (appendApi() && typeof appendApi().appendCatalogAtContext === 'function') {
            var res = appendApi().appendCatalogAtContext(visual, step, ctx);
            if (res && res.ok) {
                created = res.step;
                ctx.planId = res.planId || ctx.planId;
                ctx.tgId = res.tgId || ctx.tgId;
            }
        }

        if (!created) return null;

        syncPlanSceneFields(visual, created);

        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (typeof visual.syncYamlFromModel === 'function') visual.syncYamlFromModel();

        if (global.JmsCatalogPostAdd && typeof global.JmsCatalogPostAdd.refreshAfterSave === 'function') {
            global.JmsCatalogPostAdd.refreshAfterSave(visual, ctx.planId, ctx.tgId, created, ctx);
        }

        _pending = null;
        return { step: created, ctx: ctx };
    }

    function saveModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;

        if (_pending && _pending.mode === 'create') {
            var committed = commitPendingStep(modal);
            closeModal(false);
            if (committed && committed.step && typeof global.hfFloatToast === 'function') {
                global.hfFloatToast('已添加：' + (committed.step.label_zh || committed.step.name || committed.step.alias), { variant: 'success' });
            } else if (!committed && typeof global.hfFloatToast === 'function') {
                global.hfFloatToast('保存失败：无法写入步骤树', { variant: 'error' });
            }
            return;
        }

        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var isPlanLevel = modal.getAttribute('data-plan-level') === '1';
        var samplerStepId = modal.getAttribute('data-sampler-step-id') || '';
        var visual = vb();
        if (!visual || !planId || !stepId) return;
        if (!isPlanLevel && !tgId) return;
        var step;
        if (isPlanLevel) {
            step = locatePlanCatalogStep(visual.getModel(), stepId).step;
        } else {
            step = locateStep(visual.getModel(), planId, tgId, stepId, { samplerStepId: samplerStepId }).step;
        }
        if (!step) { closeModal(false); return; }
        applyFormToStep(modal, step);
        syncPlanSceneFields(visual, step);
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (typeof visual.syncYamlFromModel === 'function') visual.syncYamlFromModel();
        if (global.JmsCatalogPostAdd && typeof global.JmsCatalogPostAdd.refreshAfterSave === 'function') {
            global.JmsCatalogPostAdd.refreshAfterSave(visual, planId, tgId, step, isPlanLevel ? {
                context: 'test_plan'
            } : {
                httpMount: !!samplerStepId,
                parentStepId: samplerStepId || null,
                context: samplerStepId ? 'sampler_child' : 'thread_group'
            });
        } else if (typeof visual.triggerRender === 'function') {
            visual.triggerRender();
        }
        closeModal(false);
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast('已保存：' + (step.label_zh || step.name || step.alias), { variant: 'success' });
        }
    }

    function openModalForStep(step, planId, tgId, insertCtx, isCreate) {
        var modal = ensureModal();
        modal.setAttribute('data-plan-id', planId || '');
        modal.setAttribute('data-tg-id', tgId || '');
        modal.setAttribute('data-step-id', step.id || '');
        if (insertCtx && insertCtx.context === 'test_plan') {
            modal.setAttribute('data-plan-level', '1');
        } else {
            modal.removeAttribute('data-plan-level');
        }
        modal.setAttribute('data-mode', isCreate ? 'create' : 'edit');
        var samplerId = (insertCtx && (insertCtx.httpMount || insertCtx.context === 'sampler_child' || insertCtx.context === 'sampler'))
            ? insertCtx.parentStepId : '';
        if (samplerId) modal.setAttribute('data-sampler-step-id', samplerId);
        else modal.removeAttribute('data-sampler-step-id');
        fillForm(modal, step, isCreate);
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
        var nameInput = field(modal, '[data-catalog-editor-name]');
        if (nameInput) {
            global.setTimeout(function () {
                try { nameInput.focus({ preventScroll: true }); nameInput.select(); } catch (e) { nameInput.focus(); }
            }, 60);
        }
    }

    function openForCreate(comp, insertCtx, catalogState) {
        if (!comp) return;
        insertCtx = insertCtx || {};
        var draft = buildDraftStep(comp, catalogState || {});
        insertCtx = insertCtx || {};
        if (insertCtx.context === 'test_plan') {
            draft.scope = 'plan_catalog';
            if (draft.alias === 'Arguments' && !draft.catalog_props) {
                draft.catalog_props = { comments: '', arguments: [] };
            }
            if (draft.alias === 'HeaderManager' && !draft.catalog_props) {
                draft.catalog_props = { comments: '', headers: [] };
            }
            if (draft.alias === 'ConfigTestElement' && (comp.configType === 'http_defaults' || comp.guiclass === 'HttpDefaultsGui')) {
                draft.guiclass = 'HttpDefaultsGui';
                draft.testclass = 'ConfigTestElement';
                draft.category = 'config';
                draft.name = 'HTTP 请求默认值';
                draft.label_zh = 'HTTP 请求默认值';
                if (!draft.catalog_props) draft.catalog_props = defaultProps(draft);
            }
            if (draft.alias === 'BackendListener') {
                draft.category = 'listener';
                draft.guiclass = 'BackendListenerGui';
                draft.testclass = 'BackendListener';
                if (!draft.label_zh || draft.label_zh === draft.alias) {
                    draft.label_zh = 'InfluxDB Backend Listener';
                }
                if (!draft.catalog_props) draft.catalog_props = defaultProps(draft);
            }
        }
        _pending = {
            mode: 'create',
            comp: comp,
            insertCtx: insertCtx,
            catalogState: catalogState || {},
            draft: draft
        };
        openModalForStep(draft, insertCtx.planId, insertCtx.tgId, insertCtx, true);
    }

    function openForStep(planId, tgId, step, insertCtx) {
        if (!step) return;
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && typeof HN.normalizeCatalogElementStep === 'function') {
            HN.normalizeCatalogElementStep(step);
        }
        var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA && typeof JA.normalizeCatalogElementStep === 'function') {
            JA.normalizeCatalogElementStep(step);
        }
        _pending = null;
        openModalForStep(step, planId, tgId, insertCtx, false);
    }

    function bindTreeClicks() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsCatalogEditorBound === '1') return;
        root.dataset.jmsCatalogEditorBound = '1';
        root.addEventListener('click', function (ev) {
            var delBtn = ev.target.closest('.jms-btn-del-catalog, .jms-tree-del');
            if (delBtn && global.JmsCatalogElementDeleteUi && typeof global.JmsCatalogElementDeleteUi.onDeleteClick === 'function') {
                if (global.JmsCatalogElementDeleteUi.onDeleteClick(ev)) return;
            }

            var editBtn = ev.target.closest('.jms-btn-edit-catalog');
            if (editBtn) {
                ev.preventDefault();
                ev.stopPropagation();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                var card = editBtn.closest('.jms-catalog-card');
                if (!card) return;
                var visual = vb();
                if (!visual) return;
                var isPlanLevel = card.getAttribute('data-plan-level') === '1';
                var loc;
                if (isPlanLevel) {
                    loc = { step: locatePlanCatalogStep(visual.getModel(), card.getAttribute('data-step-id')).step };
                } else {
                    loc = locateStep(visual.getModel(), card.getAttribute('data-plan-id'), card.getAttribute('data-tg-id'), card.getAttribute('data-step-id'), {});
                }
                if (loc.step) {
                    openForStep(
                        card.getAttribute('data-plan-id'),
                        card.getAttribute('data-tg-id') || '',
                        loc.step,
                        isPlanLevel ? { context: 'test_plan' } : null
                    );
                }
                return;
            }

            var mountEdit = ev.target.closest('.jms-http-ctx-edit-catalog-mount');
            if (mountEdit) {
                ev.preventDefault();
                ev.stopPropagation();
                openCatalogMountEdit(mountEdit);
                return;
            }

            var mountCard = ev.target.closest('.jms-aux-card--http-mount-catalog');
            if (mountCard && ev.target.closest('.jms-http-ctx-edit-catalog-mount')) {
                ev.preventDefault();
                ev.stopPropagation();
                openCatalogMountFromCard(mountCard);
            }
        }, true);
    }

    function openCatalogMountEdit(btn) {
        var visual = vb();
        if (!visual || !btn) return;
        var planId = btn.getAttribute('data-plan-id');
        var tgId = btn.getAttribute('data-tg-id');
        var samplerId = btn.getAttribute('data-step-id');
        var idx = parseInt(btn.getAttribute('data-catalog-index'), 10);
        var sampler = global.JmsCatalogSamplerChildren &&
            global.JmsCatalogSamplerChildren.findSamplerStep(visual.getModel(), planId, tgId, samplerId);
        var item = sampler && sampler.catalog_hash_children && sampler.catalog_hash_children[idx];
        if (item) {
            openForStep(planId, tgId, item, { httpMount: true, parentStepId: samplerId, context: 'sampler_child' });
        }
    }

    function openCatalogMountFromCard(card) {
        var visual = vb();
        if (!visual || !card) return;
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        var samplerId = card.getAttribute('data-step-id');
        var mountNode = card.closest('.jms-tree-node--http-mount-catalog');
        var mountKey = mountNode && mountNode.getAttribute('data-http-mount-key');
        var idx = mountKey && mountKey.indexOf('cat:') === 0 ? parseInt(mountKey.slice(4), 10) : NaN;
        if (isNaN(idx)) {
            var editBtn = card.querySelector('.jms-http-ctx-edit-catalog-mount');
            if (editBtn) { openCatalogMountEdit(editBtn); return; }
            return;
        }
        var sampler = global.JmsCatalogSamplerChildren &&
            global.JmsCatalogSamplerChildren.findSamplerStep(visual.getModel(), planId, tgId, samplerId);
        var item = sampler && sampler.catalog_hash_children && sampler.catalog_hash_children[idx];
        if (item) {
            openForStep(planId, tgId, item, { httpMount: true, parentStepId: samplerId, context: 'sampler_child' });
        }
    }

    global.JmsCatalogElementEditorUi = {
        openForCreate: openForCreate,
        openForStep: openForStep,
        locateStep: locateStep,
        ensureModal: ensureModal,
        hasPendingCreate: function () { return !!(_pending && _pending.mode === 'create'); }
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindTreeClicks);
    } else {
        bindTreeClicks();
    }
    global.addEventListener('pageshow', bindTreeClicks);
})(window);

/* ---- js/jms_catalog_extract_apply_to_ux_v1.js ---- */
/**
 * catalog 编辑器 · 提取器/断言 Apply to / Variable 联动（隔离模块 v2）
 * 根治：按 schema 自动识别含 apply_to + Variable 的组件，不再依赖 alias 白名单。
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'jms-catalog-element-editor-modal';

    function modal() {
        return global.document.getElementById(MODAL_ID);
    }

    function dynRoot(m) {
        return m && m.querySelector('[data-catalog-editor-dynamic]');
    }

    function schemaApi() {
        return global.JmsCatalogElementEditorSchema;
    }

    function fieldEl(root, key) {
        return root ? root.querySelector('[data-dyn-input="1"][data-key="' + key + '"]') : null;
    }

    function fieldWrap(root, key) {
        return root ? root.querySelector('[data-field-key="' + key + '"]') : null;
    }

    function currentStep(m) {
        var visual = global.JmsVisualBuilder;
        var UI = global.JmsCatalogElementEditorUi;
        if (!m || !visual || !UI || typeof UI.locateStep !== 'function' || typeof visual.getModel !== 'function') {
            return null;
        }
        var stepId = m.getAttribute('data-step-id');
        if (!stepId) return null;
        if (m.getAttribute('data-plan-level') === '1') return null;
        var planId = m.getAttribute('data-plan-id');
        var tgId = m.getAttribute('data-tg-id');
        var samplerId = m.getAttribute('data-sampler-step-id') || '';
        var loc = UI.locateStep(visual.getModel(), planId, tgId, stepId, { samplerStepId: samplerId });
        return loc && loc.step ? loc.step : null;
    }

    function resolveContextStep(m) {
        var step = currentStep(m);
        if (step) return step;
        if (!m) return null;
        var alias = m.getAttribute('data-catalog-editor-step-alias') || '';
        if (!alias) {
            var aliasEl = m.querySelector('[data-catalog-editor-alias]');
            if (aliasEl) alias = (aliasEl.textContent || '').split('·')[0].trim();
        }
        if (!alias) return null;
        return {
            alias: alias,
            category: m.getAttribute('data-catalog-editor-step-category') || 'postprocessor'
        };
    }

    function stashStepMeta(m, step) {
        if (!m || !step) return;
        if (step.alias) m.setAttribute('data-catalog-editor-step-alias', step.alias);
        if (step.category) m.setAttribute('data-catalog-editor-step-category', step.category);
    }

    /** 从 schema 解析 Apply to / Variable 字段配置 */
    function resolveApplyToConfig(step) {
        var S = schemaApi();
        if (!S || !step || typeof S.getSchema !== 'function') return null;
        var schema = S.getSchema(step);
        var fields = schema.fields || [];
        var applyField = null;
        var varField = null;
        var variableModeValue = 'variable';

        fields.forEach(function (f) {
            if (!f) return;
            if (f.key === 'apply_to') {
                applyField = f;
                (f.options || []).forEach(function (o) {
                    if (!o) return;
                    if (o.val === 'jmeter_variable') variableModeValue = 'jmeter_variable';
                    else if (o.val === 'variable') variableModeValue = 'variable';
                });
            }
            if (f.key === 'apply_to_variable') {
                varField = f;
                if (variableModeValue !== 'jmeter_variable') variableModeValue = 'variable';
            }
            if (f.key === 'jmeter_variable' && !varField) {
                varField = f;
                variableModeValue = 'jmeter_variable';
            }
        });

        if (!applyField || !varField) return null;
        return {
            applyKey: applyField.key,
            varKey: varField.key,
            variableModeValue: variableModeValue
        };
    }

    function normalizeApplyToValue(val) {
        var v = val == null ? '' : String(val);
        if (v === 'both') return 'all';
        return v;
    }

    function syncVariableFieldState(m, cfg) {
        cfg = cfg || resolveApplyToConfig(resolveContextStep(m));
        var root = dynRoot(m);
        if (!cfg || !root) return;
        var applySel = fieldEl(root, cfg.applyKey);
        var varInp = fieldEl(root, cfg.varKey);
        if (!varInp) return;
        var isVar = applySel && String(applySel.value) === String(cfg.variableModeValue);
        varInp.readOnly = !isVar;
        varInp.setAttribute('aria-readonly', isVar ? 'false' : 'true');
        var wrap = fieldWrap(root, cfg.varKey) || varInp.closest('.jms-field');
        if (wrap) {
            wrap.classList.toggle('is-apply-var-active', isVar);
            wrap.classList.toggle('is-apply-var-readonly', !isVar);
        }
    }

    function dispatchChange(el) {
        if (!el) return;
        try {
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            var ev = global.document.createEvent('Event');
            ev.initEvent('change', true, true);
            el.dispatchEvent(ev);
        }
    }

    function setApplyToVariable(m, cfg, focusVar) {
        cfg = cfg || resolveApplyToConfig(resolveContextStep(m));
        var root = dynRoot(m);
        if (!cfg || !root) return;
        var applySel = fieldEl(root, cfg.applyKey);
        if (!applySel) return;
        if (String(applySel.value) !== String(cfg.variableModeValue)) {
            applySel.value = cfg.variableModeValue;
            dispatchChange(applySel);
        }
        syncVariableFieldState(m, cfg);
        if (focusVar) {
            var varInp = fieldEl(root, cfg.varKey);
            if (varInp) {
                varInp.readOnly = false;
                varInp.removeAttribute('aria-readonly');
                try { varInp.focus({ preventScroll: true }); } catch (err) { varInp.focus(); }
            }
        }
    }

    function normalizeOpenProps(step, props) {
        if (!props) return props;
        var cfg = resolveApplyToConfig(step);
        if (!cfg) return props;
        if (props.apply_to != null) props.apply_to = normalizeApplyToValue(props.apply_to);
        var varVal = props[cfg.varKey];
        if (varVal != null && String(varVal).trim()) {
            props[cfg.applyKey] = cfg.variableModeValue;
        }
        return props;
    }

    function isVariableFieldTarget(target, cfg) {
        if (!target || !target.closest || !cfg) return false;
        return !!(
            target.closest('[data-dyn-input="1"][data-key="' + cfg.varKey + '"]') ||
            target.closest('[data-field-key="' + cfg.varKey + '"]')
        );
    }

    function onModalInteraction(ev) {
        var m = modal();
        if (!m || !m.classList.contains('jms-modal-open')) return;
        var step = resolveContextStep(m);
        var cfg = resolveApplyToConfig(step);
        if (!cfg) return;

        var target = ev.target;
        if (ev.type === 'focusin' || ev.type === 'click' || ev.type === 'mousedown') {
            if (isVariableFieldTarget(target, cfg)) {
                setApplyToVariable(m, cfg, ev.type === 'focusin' || ev.type === 'mousedown');
            }
        }
        if (ev.type === 'change') {
            if (target && target.getAttribute && target.getAttribute('data-key') === cfg.applyKey) {
                syncVariableFieldState(m, cfg);
            }
        }
    }

    function patchApplyToSchemaLabels() {
        var S = schemaApi();
        if (!S || S.__extractApplySchemaPatch || typeof S.getSchema !== 'function') return;
        var orig = S.getSchema;
        S.getSchema = function (step) {
            var schema = orig(step);
            if (!schema || !Array.isArray(schema.fields)) return schema;
            schema.fields.forEach(function (f) {
                if (!f || f.key !== 'apply_to' || !Array.isArray(f.options)) return;
                f.options = f.options.map(function (o) {
                    if (!o) return o;
                    var out = {};
                    Object.keys(o).forEach(function (k) { out[k] = o[k]; });
                    if (out.val === 'both') out.val = 'all';
                    if (out.val === 'variable' || out.val === 'jmeter_variable') {
                        out.label = 'JMeter Variable Name to use';
                    }
                    return out;
                });
            });
            return schema;
        };
        S.__extractApplySchemaPatch = true;
    }

    function wrapPropsForEditor() {
        var S = schemaApi();
        if (!S || S.__extractApplyUxWrapped || typeof S.propsForEditor !== 'function') return;
        var orig = S.propsForEditor;
        S.propsForEditor = function (step) {
            var props = orig(step);
            if (step && resolveApplyToConfig(step)) {
                props = normalizeOpenProps(step, props);
            }
            return props;
        };
        S.__extractApplyUxWrapped = true;
    }

    function patchEditorUiOpen() {
        var UI = global.JmsCatalogElementEditorUi;
        if (!UI || UI.__extractApplyUiOpenPatch) return;
        UI.__extractApplyUiOpenPatch = true;
        function afterOpen() {
            global.setTimeout(function () {
                var m = modal();
                if (m && m.classList.contains('jms-modal-open')) syncVariableFieldState(m);
            }, 60);
        }
        if (typeof UI.openForStep === 'function') {
            var origStep = UI.openForStep;
            UI.openForStep = function (planId, tgId, step, insertCtx) {
                var r = origStep.apply(UI, arguments);
                stashStepMeta(modal(), step);
                afterOpen();
                return r;
            };
        }
        if (typeof UI.openForCreate === 'function') {
            var origCreate = UI.openForCreate;
            UI.openForCreate = function (comp, insertCtx, catalogState) {
                var r = origCreate.apply(UI, arguments);
                afterOpen();
                return r;
            };
        }
    }

    function observeDynamicFields(m) {
        var dyn = m && m.querySelector('[data-catalog-editor-dynamic]');
        if (!dyn || dyn.dataset.jmsExtractApplyDynObs === '1') return;
        dyn.dataset.jmsExtractApplyDynObs = '1';
        var obs = new MutationObserver(function () {
            if (m.classList.contains('jms-modal-open')) syncVariableFieldState(m);
        });
        obs.observe(dyn, { childList: true, subtree: true });
    }

    function bind() {
        patchApplyToSchemaLabels();
        wrapPropsForEditor();
        patchEditorUiOpen();
        var m = modal();
        if (!m) return;
        observeDynamicFields(m);
        if (m.dataset.jmsExtractApplyUxBound === '1') return;
        m.dataset.jmsExtractApplyUxBound = '1';
        m.addEventListener('focusin', onModalInteraction, true);
        m.addEventListener('mousedown', onModalInteraction, true);
        m.addEventListener('click', onModalInteraction, true);
        m.addEventListener('change', onModalInteraction, true);
        var obs = new MutationObserver(function () {
            if (m.classList.contains('jms-modal-open')) syncVariableFieldState(m);
        });
        obs.observe(m, { attributes: true, attributeFilter: ['class'] });
    }

    function boot() {
        bind();
        if (!modal()) global.setTimeout(boot, 200);
    }

    global.JmsCatalogExtractApplyToUxV1 = {
        bind: bind,
        resolveApplyToConfig: resolveApplyToConfig,
        syncVariableFieldState: syncVariableFieldState,
        normalizeOpenProps: normalizeOpenProps,
        setApplyToVariable: setApplyToVariable
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_editor_schema_config_gui_v1.js ---- */
/**
 * catalog 编辑器 · 配置类元件 JMeter GUI 字段对齐（隔离模块 v1）
 * 补齐 CSVDataSet 等配置元件在 ALIAS_SCHEMAS 中缺失/错误的官方字段。
 */
(function (global) {
    'use strict';

    function cloneFields(list) {
        return (list || []).map(function (f) {
            var o = {};
            Object.keys(f).forEach(function (k) { o[k] = f[k]; });
            if (Array.isArray(f.options)) o.options = f.options.slice();
            return o;
        });
    }

    var CSV_DATA_SET_GUI = [
        { key: 'filename', type: 'text', label: '文件名 (Filename)', default: '' },
        { key: 'file_encoding', type: 'text', label: '文件编码 (File encoding)', default: 'UTF-8' },
        { key: 'variable_names', type: 'text', label: '变量名称 (Variable Names)', default: '' },
        { key: 'ignore_first_line', type: 'checkbox', label: '忽略首行 (Ignore first line)', default: false },
        { key: 'delimiter', type: 'text', label: '分隔符 (Delimiter)', default: ',' },
        { key: 'quoted_data', type: 'checkbox', label: '是否允许带引号? (Quoted data)', default: false },
        { key: 'recycle', type: 'checkbox', label: '遇到文件结束符再次循环? (Recycle on EOF)', default: true },
        { key: 'stop_thread', type: 'checkbox', label: '遇到文件结束符停止线程? (Stop thread on EOF)', default: false },
        { key: 'share_mode', type: 'select', label: '线程共享模式 (Sharing mode)', default: 'shareMode.all', options: [
            { val: 'shareMode.all', label: '所有线程 (All threads)' },
            { val: 'shareMode.group', label: '当前线程组 (Current thread group)' },
            { val: 'shareMode.thread', label: '当前线程 (Current thread)' }
        ]}
    ];

    var COOKIE_POLICY_OPTS = [
        { val: 'standard', label: 'standard' },
        { val: 'standard-strict', label: 'standard-strict' },
        { val: 'ignoreCookies', label: 'ignoreCookies' },
        { val: 'netscape', label: 'netscape' },
        { val: 'default', label: 'default' },
        { val: 'rfc2109', label: 'rfc2109' },
        { val: 'rfc2965', label: 'rfc2965' },
        { val: 'best-match', label: 'best-match' },
        { val: 'compatibility', label: 'compatibility' }
    ];

    var COOKIE_MANAGER_GUI = [
        { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除 Cookie (Clear each iteration)', default: false },
        { key: 'controlled_by_thread_group', type: 'checkbox', label: 'Use Thread Group configuration to control cookie', default: false },
        { key: 'cookie_policy', type: 'select', label: 'Cookie Policy', default: 'standard', options: COOKIE_POLICY_OPTS },
        { key: 'cookies', type: 'kv', label: 'Cookie (name/value)', default: [] }
    ];

    var CONFIG_GUI_OVERRIDES = {
        CSVDataSet: { fields: cloneFields(CSV_DATA_SET_GUI) },
        CookieManager: { fields: cloneFields(COOKIE_MANAGER_GUI) }
    };

    function trimStr(v) {
        return v == null ? '' : String(v).trim();
    }

    function normalizeShareMode(val) {
        var v = trimStr(val);
        if (v === 'all') return 'shareMode.all';
        if (v === 'group') return 'shareMode.group';
        if (v === 'thread') return 'shareMode.thread';
        return v || 'shareMode.all';
    }

    function denormalizeShareMode(val) {
        var v = trimStr(val);
        if (v === 'shareMode.all') return 'shareMode.all';
        if (v === 'shareMode.group') return 'shareMode.group';
        if (v === 'shareMode.thread') return 'shareMode.thread';
        return v || 'shareMode.all';
    }

    function normalizeCsvProps(props) {
        if (!props || typeof props !== 'object') return props;
        var src = trimStr(props.source_path);
        if (src) {
            props.filename = src;
            props.source_path = src;
        }
        props.share_mode = normalizeShareMode(props.share_mode);
        if (!trimStr(props.file_encoding)) props.file_encoding = 'UTF-8';
        if (props.ignore_first_line == null) props.ignore_first_line = false;
        if (props.quoted_data == null) props.quoted_data = false;
        if (props.recycle == null) props.recycle = true;
        if (props.stop_thread == null) props.stop_thread = false;
        return props;
    }

    function resolveConfigOverride(step) {
        if (!step || !step.alias) return null;
        return CONFIG_GUI_OVERRIDES[step.alias] || null;
    }

    function walkStepsCsvNormalize(steps) {
        (steps || []).forEach(function (step) {
            if (!step || typeof step !== 'object') return;
            if (step.alias === 'CSVDataSet' && step.catalog_props) {
                normalizeCsvProps(step.catalog_props);
            }
            if (Array.isArray(step.catalog_hash_children)) walkStepsCsvNormalize(step.catalog_hash_children);
            if (Array.isArray(step.children)) walkStepsCsvNormalize(step.children);
        });
    }

    function normalizeCsvInModel(model) {
        if (!model || typeof model !== 'object') return;
        var groups = (model.setup_thread_groups || [])
            .concat(model.thread_groups || [])
            .concat(model.post_thread_groups || []);
        groups.forEach(function (tg) {
            if (!tg) return;
            if (tg.http_managers && tg.http_managers.csv_data_set) {
                normalizeCsvProps(tg.http_managers.csv_data_set);
            }
            walkStepsCsvNormalize(tg.steps);
        });
        walkStepsCsvNormalize(model.plan_catalog_items);
    }

    function patchEditorSchema() {
        var S = global.JmsCatalogElementEditorSchema;
        if (!S || S._configGuiPatchV1) return;
        S._configGuiPatchV1 = true;

        var origGetSchema = S.getSchema;
        S.getSchema = function (step) {
            if (!step) return { fields: [] };
            var ov = resolveConfigOverride(step);
            if (ov) return ov;
            return origGetSchema.call(S, step);
        };

        var origProps = S.propsForEditor;
        S.propsForEditor = function (step) {
            var props = origProps.call(S, step);
            if (step && step.alias === 'CSVDataSet') {
                props = normalizeCsvProps(props);
            }
            return props;
        };

        var origPersist = S.persistEditorProps;
        S.persistEditorProps = function (step, props) {
            var out = origPersist.call(S, step, props);
            if (step && step.alias === 'CSVDataSet' && out) {
                out = normalizeCsvProps(out);
                out.share_mode = denormalizeShareMode(out.share_mode);
                if (trimStr(out.filename)) out.source_path = trimStr(out.filename);
            }
            return out;
        };
    }

    function patchModelLoad() {
        var U = global.JmsCatalogUnifyMigrate;
        if (!U || U.__configGuiCsvLoadPatch || typeof U.migrateModel !== 'function') return;
        U.__configGuiCsvLoadPatch = true;
        var orig = U.migrateModel;
        U.migrateModel = function (model) {
            var out = orig.call(U, model);
            normalizeCsvInModel(out);
            return out;
        };
    }

    var bootScheduled = false;
    var bootAttempts = 0;

    function tryBoot() {
        bootAttempts += 1;
        var schemaReady = !!(global.JmsCatalogElementEditorSchema && typeof global.JmsCatalogElementEditorSchema.getSchema === 'function');
        if (!schemaReady) return false;
        patchEditorSchema();
        patchModelLoad();
        return true;
    }

    function boot() {
        if (tryBoot()) return;
        if (bootScheduled) return;
        bootScheduled = true;
        function retry() {
            if (tryBoot() || bootAttempts > 300) return;
            setTimeout(retry, 16);
        }
        if (global.document && global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', retry);
        }
        if (typeof global.addEventListener === 'function') {
            global.addEventListener('load', retry);
        }
        setTimeout(retry, 0);
    }

    global.JmsCatalogEditorSchemaConfigGuiV1 = {
        CONFIG_GUI_OVERRIDES: CONFIG_GUI_OVERRIDES,
        normalizeCsvProps: normalizeCsvProps,
        normalizeCsvInModel: normalizeCsvInModel,
        normalizeShareMode: normalizeShareMode,
        patch: boot
    };

    boot();
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_element_delete_ui.js ---- */
/**
 * catalog_element · 删除入口（隔离模块，不修改 jmeter_visual_builder 主流程）
 */
(function (global) {
    'use strict';

    function vb() {
        return global.JmsVisualBuilder;
    }

    function appendApi() {
        return global.JmsCatalogContextAppend;
    }

    function escLabel(s) {
        return String(s == null ? '' : s).trim();
    }

    function stopClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
    }

    function closeStepMenus(exceptBtn) {
        global.document.querySelectorAll('.lth-step-actions.is-open').forEach(function (wrap) {
            if (exceptBtn && wrap.contains(exceptBtn)) return;
            wrap.classList.remove('is-open', 'is-hover', 'is-measuring');
            var menu = wrap.querySelector('.lth-step-menu');
            if (menu) menu.classList.remove('lth-step-menu--dropup');
        });
    }

    function removeStepFromList(list, stepId) {
        if (!list || !stepId) return false;
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === want) {
                list.splice(i, 1);
                return true;
            }
            if (Array.isArray(s.children) && removeStepFromList(s.children, stepId)) {
                return true;
            }
        }
        return false;
    }

    function findTg(model, planId, tgId) {
        if (appendApi() && typeof appendApi().findTg === 'function') {
            return appendApi().findTg(model, planId, tgId);
        }
        return null;
    }

    function resolveCard(btn) {
        return btn.closest(
            '.jms-catalog-card, .jms-plan-catalog-card, .jms-catalog-plan-native, .jms-aux-card.jms-catalog-plan-native'
        );
    }

    function resolveContext(btn) {
        var card = resolveCard(btn);
        var planId = btn.getAttribute('data-plan-id') || (card && card.getAttribute('data-plan-id')) || '';
        var tgId = btn.getAttribute('data-tg-id');
        if (tgId == null && card) tgId = card.getAttribute('data-tg-id');
        tgId = tgId || '';
        var stepId = btn.getAttribute('data-step-id') || (card && card.getAttribute('data-step-id')) || '';
        var isPlanLevel = (card && card.getAttribute('data-plan-level') === '1') || !tgId;
        return { card: card, planId: planId, tgId: tgId, stepId: stepId, isPlanLevel: isPlanLevel };
    }

    function resolveStep(model, ctx) {
        if (!model || !ctx || !ctx.stepId) return null;
        if (ctx.isPlanLevel) {
            var list = model.plan_catalog_items || [];
            var want = String(ctx.stepId);
            for (var i = 0; i < list.length; i += 1) {
                if (list[i] && String(list[i].id) === want) return list[i];
            }
            return null;
        }
        var tg = findTg(model, ctx.planId, ctx.tgId);
        if (!tg || !Array.isArray(tg.steps)) return null;
        var E = global.JmsCatalogElementEditorUi;
        if (E && typeof E.locateStep === 'function') {
            var loc = E.locateStep(model, ctx.planId, ctx.tgId, ctx.stepId, {});
            if (loc && loc.step) return loc.step;
        }
        return walkFindStep(tg.steps, ctx.stepId);
    }

    function walkFindStep(list, stepId) {
        if (!list || !stepId) return null;
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === want) return s;
            if (Array.isArray(s.children)) {
                var nested = walkFindStep(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function stepLabel(step, fallback) {
        if (!step) return fallback || '该元件';
        return escLabel(step.name || step.label_zh || step.alias) || fallback || '该元件';
    }

    function confirmDelete(title, name, action) {
        var visual = vb();
        if (visual && typeof visual.runWithConfirm === 'function') {
            visual.runWithConfirm({
                title: title || '删除元件',
                message: '确定删除「' + name + '」吗？删除后不可恢复。'
            }, action);
            return;
        }
        var Del = global.JmsComponentDelete;
        if (Del && typeof Del.confirm === 'function') {
            Del.confirm({
                title: title || '删除元件',
                name: name,
                message: '确定删除「' + name + '」吗？删除后不可恢复。'
            }).then(function (ok) {
                if (ok && typeof action === 'function') action();
            });
            return;
        }
        if (global.confirm('确定删除「' + name + '」吗？') && typeof action === 'function') {
            action();
        }
    }

    function markDirtyAndRender(visual) {
        if (!visual) return;
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (typeof visual.triggerRender === 'function') visual.triggerRender();
        if (typeof visual.syncYamlFromModel === 'function') visual.syncYamlFromModel();
    }

    function removePlanCatalogStep(model, step, stepId) {
        var list = model.plan_catalog_items || [];
        var before = list.length;
        model.plan_catalog_items = list.filter(function (it) {
            if (!it) return false;
            if (step && it === step) return false;
            if (stepId && String(it.id) === String(stepId)) return false;
            return true;
        });
        return model.plan_catalog_items.length < before;
    }

    function performDelete(ctx, step) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var model = visual.getModel();
        if (!model) return false;

        var stepId = (step && step.id) || ctx.stepId;
        if (!stepId && !step) return false;

        var ok = false;
        if (ctx.isPlanLevel) {
            ok = removePlanCatalogStep(model, step, stepId);
        } else {
            var tg = findTg(model, ctx.planId, ctx.tgId);
            if (tg && Array.isArray(tg.steps)) {
                ok = removeStepFromList(tg.steps, stepId);
            }
        }
        if (!ok) return false;
        markDirtyAndRender(visual);
        return true;
    }

    function onDeleteClick(ev) {
        var btn = ev.target.closest('.jms-btn-del-catalog, .jms-tree-del');
        if (!btn) return false;

        stopClick(ev);
        closeStepMenus(btn);

        var ctx = resolveContext(btn);
        if (!ctx.planId || !ctx.stepId) return true;

        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return true;
        var model = visual.getModel();
        if (!model) return true;

        var step = resolveStep(model, ctx);
        var label = stepLabel(step, '该元件');
        var title = ctx.isPlanLevel ? '删除计划元件' : '删除步骤元件';
        var frozenCtx = {
            card: ctx.card,
            planId: ctx.planId,
            tgId: ctx.tgId,
            stepId: (step && step.id) || ctx.stepId,
            isPlanLevel: ctx.isPlanLevel
        };

        confirmDelete(title, label, function () {
            performDelete(frozenCtx, step);
        });
        return true;
    }

    function bind() {
        /* 由 jms_catalog_element_editor_ui.bindTreeClicks 统一委托，避免重复绑定 */
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogElementDeleteUi = {
        bind: bind,
        onDeleteClick: onDeleteClick,
        performDelete: performDelete
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmeter_dropdown_scroll_guard.js ---- */
/**
 * JMeter 压测 · 下拉菜单滚动时保持展开（隔离模块）
 * 场景1：滚轮导致页面/步骤区滚动时不收回已打开的下拉菜单。
 */
(function (global) {
    'use strict';

    var OPEN_MORE_SEL = '.jms-v2-native-fallback.is-open,' +
        ' .jms-tg-config-more.is-open, .jms-tg-logic-ctrl-more.is-open, .jms-tg-sampler-more.is-open,' +
        ' .jms-tg-post-proc-more.is-open, .jms-tg-assert-more.is-open, .jms-tg-listener-more.is-open,' +
        ' .jms-http-ctx-proc-more.is-open, .jms-http-ctx-preproc-more.is-open, .jms-http-ctx-timer-more.is-open,' +
        ' .jms-http-ctx-config-more.is-open, .jms-http-ctx-assert-more.is-open, .jms-http-ctx-listener-more.is-open, .jms-http-ctx-logic-more.is-open,' +
        ' .jms-if-mount-ctx-sampler-more.is-open, .jms-if-mount-ctx-logic-more.is-open, .jms-if-mount-ctx-assert-more.is-open,' +
        ' .jms-if-mount-ctx-timer-more.is-open, .jms-if-mount-ctx-preproc-more.is-open, .jms-if-mount-ctx-proc-more.is-open,' +
        ' .jms-if-mount-ctx-config-more.is-open, .jms-if-mount-ctx-listener-more.is-open';

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function hasOpenDropdownMenu() {
        if (global.document.getElementById('jms-v2-catalog-popup')) return true;
        if (global.document.body.classList.contains('jms-v2-catalog-popup-open')) return true;
        if (global.document.querySelector(OPEN_MORE_SEL)) return true;
        return false;
    }

    function shouldKeepOpenOnScroll(ev) {
        if (!isJmeterTab()) return false;
        if (hasOpenDropdownMenu()) return true;
        if (!ev || !ev.target || !ev.target.closest) return false;
        if (ev.target.closest('#jms-v2-catalog-popup')) return true;
        if (ev.target.closest('[role="menu"]:not([aria-hidden="true"])')) return true;
        return false;
    }

    global.JmsJmeterDropdownScrollGuard = {
        hasOpenDropdownMenu: hasOpenDropdownMenu,
        shouldKeepOpenOnScroll: shouldKeepOpenOnScroll
    };
}(typeof window !== 'undefined' ? window : this));
/* ---- js/jms_jmeter_catalog_popup_anchor_fix.js ---- */
/**
 * JMeter 压测 · Catalog 弹层滚动锚定（隔离模块）
 * 场景1：页面/步骤区滚动时保持弹层打开，并重新定位到触发按钮下方。
 */
(function (global) {
    'use strict';

    function getPopup() {
        return global.document.getElementById('jms-v2-catalog-popup');
    }

    function getAnchor(pop) {
        if (!pop) return null;
        if (pop.__jmsAnchorEl && pop.__jmsAnchorEl.isConnected) return pop.__jmsAnchorEl;
        return null;
    }

    function repositionOpenPopup() {
        var pop = getPopup();
        if (!pop) return false;
        var anchor = getAnchor(pop);
        if (!anchor) return false;
        var Menu = global.JmsCatalogMenuV2;
        if (Menu && typeof Menu.positionPopup === 'function') {
            Menu.positionPopup(anchor, pop);
            return true;
        }
        return false;
    }

    function bindPopup(pop, anchor) {
        if (!pop || !anchor) return;
        pop.__jmsAnchorEl = anchor;
        repositionOpenPopup();
    }

    function scheduleReposition() {
        if (!getPopup()) return;
        if (global.requestAnimationFrame) {
            global.requestAnimationFrame(repositionOpenPopup);
        } else {
            repositionOpenPopup();
        }
    }

    function init() {
        if (global.__jmsCatalogPopupAnchorFixBound) return;
        global.__jmsCatalogPopupAnchorFixBound = true;
        global.document.addEventListener('scroll', scheduleReposition, true);
        global.addEventListener('resize', scheduleReposition);
        global.document.addEventListener('wheel', scheduleReposition, { capture: true, passive: true });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsJmeterCatalogPopupAnchorFix = {
        bindPopup: bindPopup,
        repositionOpenPopup: repositionOpenPopup
    };
}(typeof window !== 'undefined' ? window : this));
/* ---- js/jms_catalog_menu_v2.js ---- */
/**
 * JMeter Studio V2 · 统一 catalog 菜单（劫持 TG / HTTP / 逻辑控制器挂载区工具栏）
 */
(function (global) {
    'use strict';

    var VER = '20260708mountadd5';
    var catalogState = { loaded: false, loading: false, components: [], hierarchy: null, templates: {} };

    var PLAN_HIJACKS = [
        { wrap: '.jms-plan-catalog-more--listener', trigger: '.jms-plan-catalog-trigger--listener', menu: '.jms-plan-catalog-menu--listener', category: 'listener', label: '监听器' },
        { wrap: '.jms-plan-catalog-more--config', trigger: '.jms-plan-catalog-trigger--config', menu: '.jms-plan-catalog-menu--config', category: 'config', label: '配置元件' },
        { wrap: '.jms-plan-catalog-more--other', trigger: '.jms-plan-catalog-trigger--other', menu: '.jms-plan-catalog-menu--other', category: 'other', label: '其他元件' }
    ];

    var TG_HIJACKS = [
        { wrap: '.jms-tg-config-more', trigger: '.jms-tg-config-trigger', menu: '.jms-tg-config-menu', category: 'config', label: '配置元件' },
        { wrap: '.jms-tg-post-proc-more', trigger: '.jms-tg-post-proc-trigger', menu: '.jms-tg-post-proc-menu', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-tg-logic-ctrl-more', trigger: '.jms-tg-logic-ctrl-trigger', menu: '.jms-tg-logic-ctrl-menu', category: 'controller', label: '逻辑控制器' },
        { wrap: '.jms-tg-sampler-more', trigger: '.jms-tg-sampler-trigger', menu: '.jms-tg-sampler-menu', category: 'sampler', label: '取样器' },
        { wrap: '.jms-tg-assert-more', trigger: '.jms-tg-assert-trigger', menu: '.jms-tg-assert-menu', category: 'assertion', label: '断言' },
        { wrap: '.jms-tg-listener-more', trigger: '.jms-tg-listener-menu-trigger', menu: '.jms-tg-listener-menu', category: 'listener', label: '监听器' }
    ];

    var HTTP_HIJACKS = [
        { wrap: '.jms-http-ctx-proc-more', trigger: '.jms-http-ctx-btn-processors', menu: '.jms-http-ctx-proc-menu', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-http-ctx-preproc-more', trigger: '.jms-http-ctx-btn-preprocessors, .jms-http-ctx-btn-preproc', menu: '.jms-http-ctx-preproc-menu', category: 'preprocessor', label: '前置处理器' },
        { wrap: '.jms-http-ctx-timer-more', trigger: '.jms-http-ctx-btn-timers', menu: '.jms-http-ctx-timer-menu', category: 'timer', label: '定时器' },
        { wrap: '.jms-http-ctx-config-more', trigger: '.jms-http-ctx-btn-config', menu: '.jms-http-ctx-config-menu', category: 'config', label: '配置元件' },
        { wrap: '.jms-http-ctx-assert-more', trigger: '.jms-http-ctx-btn-assert-menu', menu: '.jms-http-ctx-assert-menu', category: 'assertion', label: '断言' },
        { wrap: '.jms-http-ctx-listener-more', trigger: '.jms-http-ctx-btn-listeners', menu: '.jms-http-ctx-listener-menu', category: 'listener', label: '监听器' },
        { wrap: '.jms-http-ctx-logic-more', trigger: '.jms-http-ctx-btn-logic', menu: '.jms-http-ctx-logic-menu', category: 'controller', label: '逻辑控制器' }
    ];

    var CTRL_HIJACKS = [
        { wrap: '.jms-if-mount-ctx-sampler-more', trigger: '.jms-if-mount-ctx-btn-sampler', menu: '.jms-if-mount-ctx-menu', category: 'sampler', label: '取样器' },
        { wrap: '.jms-if-mount-ctx-logic-more', trigger: '.jms-if-mount-ctx-btn-logic', menu: '.jms-if-mount-ctx-menu', category: 'controller', label: '逻辑控制器' },
        { wrap: '.jms-if-mount-ctx-assert-more', trigger: '.jms-if-mount-ctx-btn-assert', menu: '.jms-if-mount-ctx-menu', category: 'assertion', label: '断言' },
        { wrap: '.jms-if-mount-ctx-timer-more', trigger: '.jms-if-mount-ctx-btn-timer', menu: '.jms-if-mount-ctx-menu', category: 'timer', label: '定时器' },
        { wrap: '.jms-if-mount-ctx-preproc-more', trigger: '.jms-if-mount-ctx-btn-preproc', menu: '.jms-if-mount-ctx-menu', category: 'preprocessor', label: '前置处理器' },
        { wrap: '.jms-if-mount-ctx-proc-more', trigger: '.jms-if-mount-ctx-btn-processors', menu: '.jms-if-mount-ctx-menu', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-if-mount-ctx-config-more', trigger: '.jms-if-mount-ctx-btn-config', menu: '.jms-if-mount-ctx-menu', category: 'config', label: '配置元件' },
        { wrap: '.jms-if-mount-ctx-listener-more', trigger: '.jms-if-mount-ctx-btn-listeners', menu: '.jms-if-mount-ctx-menu', category: 'listener', label: '监听器' }
    ];

    var TG_CHIP_CATS = [
        { category: 'preprocessor', label: '前置处理器' },
        { category: 'timer', label: '定时器' }
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function isActive() {
        return global.document.body.classList.contains('lth-jmeter-catalog-v2') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function ensureBodyClass() {
        if (global.document.body.classList.contains('lth-hub-jmeter-tab')) {
            global.document.body.classList.add('lth-jmeter-catalog-v2');
        }
    }

    function injectCss() {
        if (global.document.getElementById('jms-v2-catalog-menu-css')) return;
        var link = global.document.createElement('link');
        link.id = 'jms-v2-catalog-menu-css';
        link.rel = 'stylesheet';
        link.href = '/static/css/jms_catalog_menu_v2.css?v=' + VER;
        global.document.head.appendChild(link);
    }

    function loadCatalog(cb) {
        if (catalogState.loaded) { cb(null); return; }
        if (catalogState.loading) {
            setTimeout(function () { loadCatalog(cb); }, 80);
            return;
        }
        catalogState.loading = true;
        fetch('/api/jmeter-scenario/component-catalog', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d || !d.ok) throw new Error((d && d.error) || 'catalog 加载失败');
                catalogState.components = d.components || [];
                catalogState.hierarchy = d.hierarchy || d.placement || null;
                catalogState.templates = d.templates || {};
                catalogState.loaded = true;
                cb(null);
            })
            .catch(cb)
            .finally(function () { catalogState.loading = false; });
    }

    function filterComps(ctx, category) {
        var list = catalogState.components || [];
        var bridge = global.JmsStudioCatalogBridgeV2;
        var effCat = global.JmsHierarchyRules && typeof global.JmsHierarchyRules.effectiveCategory === 'function'
            ? function (c) { return global.JmsHierarchyRules.effectiveCategory(c, ctx.context); }
            : function (c) { return c.category; };
        return list.filter(function (c) {
            if (category && effCat(c) !== category) return false;
            if (bridge && typeof bridge.isAllowedForMount === 'function') {
                return bridge.isAllowedForMount(c, ctx, category);
            }
            if (global.JmsHierarchyRules && typeof global.JmsHierarchyRules.componentAllowed === 'function') {
                return global.JmsHierarchyRules.componentAllowed(c, ctx.context);
            }
            return true;
        });
    }

    function clipBottomForAnchor(anchor) {
        var margin = 8;
        var clip = global.innerHeight - margin;
        var footer = global.document.querySelector('.hf-site-footer, footer[data-hf-footer]');
        if (footer) {
            var ft = footer.getBoundingClientRect().top;
            if (ft > 0) clip = Math.min(clip, ft - margin);
        }
        var workspace = anchor.closest('.lth-studio-workspace') ||
            global.document.querySelector('.lth-studio-workspace, #jms-visual-wrap');
        if (workspace) {
            var wb = workspace.getBoundingClientRect().bottom;
            if (wb > 0) clip = Math.min(clip, wb - margin);
        }
        var tgBlock = anchor.closest('.jms-tg-block--tree, .jms-plan-card');
        if (tgBlock) {
            var tb = tgBlock.getBoundingClientRect().bottom;
            if (tb > 0) clip = Math.min(clip, tb - margin);
        }
        return Math.max(margin + 80, clip);
    }

    function positionPopup(anchor, pop) {
        var margin = 8;
        var rect = anchor.getBoundingClientRect();
        var clipBottom = clipBottomForAnchor(anchor);
        var spaceBelow = clipBottom - rect.bottom - margin;
        var spaceAbove = rect.top - margin;
        var maxH = Math.max(100, Math.max(spaceBelow, spaceAbove) - margin);
        pop.style.maxHeight = maxH + 'px';
        pop.style.overflowY = 'hidden';
        var left = Math.min(rect.left, global.innerWidth - pop.offsetWidth - margin);
        var top = rect.bottom + 4;
        if (top + pop.offsetHeight > clipBottom && spaceAbove > spaceBelow) {
            top = rect.top - pop.offsetHeight - 4;
            pop.classList.add('jms-v2-catalog-popup--dropup');
        } else {
            pop.classList.remove('jms-v2-catalog-popup--dropup');
        }
        if (top < margin) top = margin;
        pop.style.left = Math.max(margin, left) + 'px';
        pop.style.top = top + 'px';
    }

    var NATIVE_MORE_SEL = '.jms-tg-config-more, .jms-tg-logic-ctrl-more, .jms-tg-sampler-more, .jms-tg-post-proc-more, .jms-tg-assert-more, .jms-tg-listener-more,' +
        ' .jms-http-ctx-proc-more, .jms-http-ctx-preproc-more, .jms-http-ctx-timer-more, .jms-http-ctx-config-more, .jms-http-ctx-assert-more, .jms-http-ctx-listener-more, .jms-http-ctx-logic-more,' +
        ' .jms-if-mount-ctx-sampler-more, .jms-if-mount-ctx-logic-more, .jms-if-mount-ctx-assert-more, .jms-if-mount-ctx-timer-more, .jms-if-mount-ctx-preproc-more, .jms-if-mount-ctx-proc-more, .jms-if-mount-ctx-config-more, .jms-if-mount-ctx-listener-more';
    var NATIVE_MENU_ITEM_SEL = '.jms-http-ctx-proc-item, .jms-http-ctx-preproc-item, .jms-http-ctx-timer-item, .jms-http-ctx-config-item, .jms-http-ctx-assert-item, .jms-http-ctx-listener-item, .jms-http-ctx-logic-item,' +
        ' .jms-if-mount-ctx-item, .jms-tg-post-proc-item, .jms-tg-logic-ctrl-item, .jms-tg-sampler-item, .jms-tg-assert-item, .jms-tg-listener-item';

    function isInsideNativeFallbackClick(t) {
        if (!t || !t.closest) return false;
        var openWrap = t.closest('.jms-v2-native-fallback.is-open');
        if (!openWrap) return false;
        if (t.closest(NATIVE_MENU_ITEM_SEL)) return true;
        if (t.closest('[class*="-menu"]')) return true;
        return false;
    }


    function closeNativeMoreWrap(wrap) {
        if (!wrap) return;
        wrap.classList.remove('is-open', 'jms-v2-native-fallback');
        wrap.removeAttribute('data-v2-native-fallback');
        var tr = wrap.querySelector('[aria-haspopup="true"], button');
        if (tr) tr.setAttribute('aria-expanded', 'false');
        var menu = wrap.querySelector('[role="menu"]');
        if (menu) menu.setAttribute('aria-hidden', 'true');
    }

    function closeAllNativeTgMenus() {
        global.document.querySelectorAll(NATIVE_MORE_SEL + '.is-open').forEach(closeNativeMoreWrap);
    }

    function closePopup() {
        var p = global.document.getElementById('jms-v2-catalog-popup');
        if (p) p.remove();
        global.document.body.classList.remove('jms-v2-catalog-popup-open');
    }

    function closeAllDropdowns() {
        closePopup();
        closeAllNativeTgMenus();
    }

    function isScrollInsidePopup(ev) {
        var pop = global.document.getElementById('jms-v2-catalog-popup');
        if (!pop || !ev) return false;
        var target = ev.target;
        if (!target || target.nodeType !== 1) return false;
        return pop === target || pop.contains(target);
    }

    function bindPopupScrollShield(pop) {
        if (!pop || pop.dataset.jmsV2ScrollShield === '1') return;
        pop.dataset.jmsV2ScrollShield = '1';
        var bodyEl = pop.querySelector('.jms-v2-catalog-popup__body');
        if (bodyEl) {
            bodyEl.addEventListener('scroll', function (ev) { ev.stopPropagation(); }, true);
        }
    }

    function toggleNativeMenuFallback(wrap, menuSel) {
        return false;
    }

    function openPopup(anchor, ctx, category, title, hit, triggerKey) {
        closeAllDropdowns();
        loadCatalog(function (err) {
            if (err) {
                if (hit && hit.wrap && hit.menu && anchor) {
                    var fbWrap = anchor.closest(hit.wrap);
                    if (fbWrap && toggleNativeMenuFallback(fbWrap, hit.menu)) {
                        if (typeof global.hfFloatToast === 'function') {
                            global.hfFloatToast('元件目录暂不可用，已切换本地菜单', { variant: 'warning' });
                        }
                        return;
                    }
                }
                if (typeof global.hfFloatToast === 'function') {
                    global.hfFloatToast(err.message || String(err), { variant: 'error' });
                }
                return;
            }
            var items = filterComps(ctx, category);
            if (!items.length && hit && hit.wrap && hit.menu && anchor) {
                var emptyWrap = anchor.closest(hit.wrap);
                if (emptyWrap && toggleNativeMenuFallback(emptyWrap, hit.menu)) {
                    if (typeof global.hfFloatToast === 'function') {
                        global.hfFloatToast('元件目录暂无匹配项，已切换本地菜单', { variant: 'warning' });
                    }
                    return;
                }
            }
            var pop = global.document.createElement('div');
            pop.id = 'jms-v2-catalog-popup';
            pop.className = 'jms-v2-catalog-popup';
            pop.setAttribute('role', 'menu');
            var head = '<div class="jms-v2-catalog-popup__head">' + esc(title) + ' · ' + esc(ctx.label || ctx.context) +
                ' <span class="jms-v2-catalog-popup__n">(' + items.length + ')</span></div>';
            var body = items.length
                ? items.map(function (c) {
                    return '<button type="button" class="jms-v2-catalog-popup__item" data-alias="' + esc(c.alias) + '">' +
                        esc(c.label_zh || c.alias) + '</button>';
                }).join('')
                : '<p class="jms-v2-catalog-popup__empty">当前层级无可用元件</p>';
            pop.innerHTML = head + '<div class="jms-v2-catalog-popup__body">' + body + '</div>';
            if (triggerKey) pop.dataset.triggerKey = triggerKey;
            global.document.body.appendChild(pop);
            global.document.body.classList.add('jms-v2-catalog-popup-open');
            bindPopupScrollShield(pop);
            pop.__jmsAnchorEl = anchor;
            if (global.JmsJmeterCatalogPopupAnchorFix && typeof global.JmsJmeterCatalogPopupAnchorFix.bindPopup === 'function') {
                global.JmsJmeterCatalogPopupAnchorFix.bindPopup(pop, anchor);
            }
            positionPopup(anchor, pop);
            pop.addEventListener('click', function (ev) {
                var btn = ev.target.closest('.jms-v2-catalog-popup__item');
                if (!btn) return;
                ev.stopPropagation();
                var alias = btn.getAttribute('data-alias');
                var comp = (catalogState.components || []).filter(function (x) { return x.alias === alias; })[0];
                if (comp && global.JmsStudioCatalogBridgeV2) {
                    global.JmsStudioCatalogBridgeV2.addComponent(comp, ctx, catalogState);
                }
                closePopup();
            });
        });
    }

    function ctxFromPlanCatalogWrap(wrap) {
        if (!wrap) return null;
        var planId = wrap.getAttribute('data-plan-id');
        if (!planId) {
            var vb = global.JmsVisualBuilder;
            var m = vb && typeof vb.getModel === 'function' ? vb.getModel() : null;
            if (m && m.test_plans && m.test_plans[0]) planId = m.test_plans[0].id;
        }
        return {
            context: 'test_plan',
            label: '测试计划',
            planId: planId,
            tgId: null,
            parentStepId: null
        };
    }

    function ctxFromHttpWrap(wrap) {
        var httpCtx = wrap.closest('.jms-http-context');
        if (!httpCtx) return null;
        return {
            context: 'sampler_child',
            label: '取样器',
            planId: httpCtx.getAttribute('data-plan-id'),
            tgId: httpCtx.getAttribute('data-tg-id'),
            parentStepId: httpCtx.getAttribute('data-step-id'),
            httpMount: true
        };
    }

    function ctxFromControllerWrap(wrap) {
        var mountCtx = wrap.closest('.jms-if-mount-context, .jms-catalog-mount-context');
        if (!mountCtx) return null;
        var parentStepId = mountCtx.getAttribute('data-if-step-id') ||
            mountCtx.getAttribute('data-catalog-step-id') || '';
        if (!parentStepId) return null;
        return {
            context: 'controller',
            label: '逻辑控制器',
            planId: mountCtx.getAttribute('data-plan-id'),
            tgId: mountCtx.getAttribute('data-tg-id'),
            parentStepId: parentStepId,
            controllerMount: true
        };
    }

    function ctxFromTgToolbarWrap(wrap, trigger) {
        if (!wrap) return null;
        var host = wrap.closest('.jms-tg-tools, .jms-tg-tree-head, .jms-tg-tree-head-add');
        if (!host && !(trigger && trigger.classList && trigger.classList.contains('jms-tg-config-btn'))) return null;
        var planId = (trigger && trigger.getAttribute('data-plan-id')) || wrap.getAttribute('data-plan-id');
        var tgId = (trigger && trigger.getAttribute('data-tg-id')) || wrap.getAttribute('data-tg-id');
        if (!planId || !tgId) {
            var block = wrap.closest('.jms-tg-block, .jms-tg-block--tree');
            if (block) {
                planId = planId || block.getAttribute('data-plan-id');
                tgId = tgId || block.getAttribute('data-tg-id');
            }
        }
        if (!planId || !tgId) return null;
        return {
            context: 'thread_group',
            label: '线程组',
            planId: planId,
            tgId: tgId,
            parentStepId: null
        };
    }

    function resolveContext(wrap, trigger) {
        var planWrap = (wrap && wrap.closest('.jms-plan-catalog-more')) ||
            (trigger && trigger.closest('.jms-plan-catalog-more'));
        if (planWrap) return ctxFromPlanCatalogWrap(planWrap);
        var ctrl = ctxFromControllerWrap(wrap);
        if (ctrl) return enrichCtx(ctrl, wrap);
        var tg = ctxFromTgToolbarWrap(wrap, trigger);
        if (tg) return enrichCtx(tg, wrap);
        var http = ctxFromHttpWrap(wrap);
        if (http) return enrichCtx(http, wrap);
        var vb = global.JmsVisualBuilder;
        if (global.JmsInsertContextV2 && vb) {
            return enrichCtx(global.JmsInsertContextV2.resolve(vb), wrap);
        }
        return enrichCtx({
            context: 'thread_group',
            label: '线程组',
            planId: wrap.getAttribute('data-plan-id'),
            tgId: wrap.getAttribute('data-tg-id'),
            parentStepId: null
        }, wrap);
    }

    function enrichCtx(ctx, wrap) {
        ctx = ctx || {};
        if (ctx.planId && ctx.tgId) return ctx;
        var block = wrap && wrap.closest
            ? wrap.closest('.jms-tg-block--tree, .jms-tg-block, .jms-http-context, .jms-if-mount-context')
            : null;
        if (block) {
            ctx.planId = ctx.planId || block.getAttribute('data-plan-id');
            ctx.tgId = ctx.tgId || block.getAttribute('data-tg-id');
        }
        if ((!ctx.planId || !ctx.tgId) && global.JmsVisualBuilder &&
            typeof global.JmsVisualBuilder.resolveActiveThreadGroupContext === 'function') {
            var active = global.JmsVisualBuilder.resolveActiveThreadGroupContext();
            if (active) {
                ctx.planId = ctx.planId || active.planId;
                ctx.tgId = ctx.tgId || active.tgId;
            }
        }
        return ctx;
    }

    function matchHijack(t) {
        var i;
        for (i = 0; i < PLAN_HIJACKS.length; i += 1) {
            if (t.closest(PLAN_HIJACKS[i].trigger)) return PLAN_HIJACKS[i];
        }
        for (i = 0; i < TG_HIJACKS.length; i += 1) {
            if (t.closest(TG_HIJACKS[i].trigger)) return TG_HIJACKS[i];
        }
        for (i = 0; i < HTTP_HIJACKS.length; i += 1) {
            if (t.closest(HTTP_HIJACKS[i].trigger)) return HTTP_HIJACKS[i];
        }
        for (i = 0; i < CTRL_HIJACKS.length; i += 1) {
            if (t.closest(CTRL_HIJACKS[i].trigger)) return CTRL_HIJACKS[i];
        }
        return null;
    }

    function onCaptureClick(ev) {
        if (!isActive()) return;
        var t = ev.target;
        if (t.closest('#jms-v2-catalog-popup')) return;
        var hit = matchHijack(t);
        if (!hit) {
            if (!isInsideNativeFallbackClick(t)) {
                closeAllDropdowns();
            }
            return;
        }
        var trigger = t.closest(hit.trigger);
        if (!trigger) return;
        var wrap = t.closest(hit.wrap);
        if (!wrap) return;
        var existingPop = global.document.getElementById('jms-v2-catalog-popup');
        var triggerKey = (wrap.getAttribute('data-plan-id') || '') + ':' + (wrap.getAttribute('data-tg-id') || '') + ':' + hit.category + ':' + (trigger.className || '');
        if (existingPop && existingPop.dataset.triggerKey === triggerKey) {
            closeAllDropdowns();
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            return;
        }
        if (wrap.classList.contains('is-open') && !existingPop && wrap.classList.contains('jms-v2-native-fallback')) {
            closeNativeMoreWrap(wrap);
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            return;
        }
        closeAllDropdowns();
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        var ctx = resolveContext(wrap, trigger);
        openPopup(trigger, ctx, hit.category, hit.label, hit, triggerKey);
    }

    function injectTgChips() {
        if (!global.document.body.classList.contains('lth-tg-view-tree')) return;
        global.document.querySelectorAll('.jms-tg-tree-head-add:not([data-v2-chips])').forEach(function (row) {
            row.setAttribute('data-v2-chips', '1');
            var wrap = global.document.createElement('span');
            wrap.className = 'jms-v2-add-wrap';
            TG_CHIP_CATS.forEach(function (cat) {
                var b = global.document.createElement('button');
                b.type = 'button';
                b.className = 'jms-v2-add-btn';
                b.textContent = '+' + cat.label.replace('处理器', '');
                b.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    var ctx = resolveContext(row.closest('.jms-tg-tree-head') || row);
                    openPopup(b, ctx, cat.category, cat.label);
                });
                wrap.appendChild(b);
            });
            row.appendChild(wrap);
        });
    }

    function markHijacked(list) {
        list.forEach(function (h) {
            global.document.querySelectorAll(h.wrap + ':not([data-v2-hijack])').forEach(function (el) {
                el.setAttribute('data-v2-hijack', '1');
                var menu = el.querySelector(h.menu);
                if (menu) menu.setAttribute('aria-hidden', 'true');
            });
        });
    }

    function init() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        ensureBodyClass();
        injectCss();
        if (!global.document.documentElement.dataset.jmsV2CatalogCapture) {
            global.document.documentElement.dataset.jmsV2CatalogCapture = '1';
            global.document.addEventListener('click', onCaptureClick, true);
            global.addEventListener('resize', closePopup);
            global.addEventListener('scroll', function (ev) {
                if (isScrollInsidePopup(ev)) return;
                if (global.JmsJmeterDropdownScrollGuard &&
                    typeof global.JmsJmeterDropdownScrollGuard.shouldKeepOpenOnScroll === 'function' &&
                    global.JmsJmeterDropdownScrollGuard.shouldKeepOpenOnScroll(ev)) {
                    return;
                }
                closeAllDropdowns();
            }, true);
        }
        markHijacked(PLAN_HIJACKS);
        markHijacked(TG_HIJACKS);
        markHijacked(HTTP_HIJACKS);
        markHijacked(CTRL_HIJACKS);
        injectTgChips();
        var root = global.document.getElementById('jms-plans-container');
        if (root && !root.dataset.jmsV2Obs) {
            root.dataset.jmsV2Obs = '1';
            new MutationObserver(function () {
                markHijacked(PLAN_HIJACKS);
        markHijacked(TG_HIJACKS);
                markHijacked(HTTP_HIJACKS);
                markHijacked(CTRL_HIJACKS);
                injectTgChips();
            }).observe(root, { childList: true, subtree: true });
        }
    }

    global.JmsCatalogMenuV2 = {
        init: init,
        closePopup: closePopup,
        closeAllDropdowns: closeAllDropdowns,
        closeAllNativeTgMenus: closeAllNativeTgMenus,
        loadCatalog: loadCatalog,
        filterComps: filterComps,
        positionPopup: positionPopup,
        openPopup: openPopup,
        toggleNativeMenuFallback: toggleNativeMenuFallback,
        isInsideNativeFallbackClick: isInsideNativeFallbackClick,
        getState: function () { return catalogState; },
        VERSION: VER
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    global.addEventListener('pageshow', init);
})(window);

/* ---- js/jms_studio_v2_step_edit_bridge.js ---- */
/**
 * Studio v2 · 统一步骤「编辑」路由（逻辑控制器 + TG 后置处理器等新组件）
 * 修复树形视图下新组件编辑按钮无法打开弹窗（桥接未接入 / visual-root 绑定失败）
 */
(function (global) {
    'use strict';

    var EDIT_ROUTES = {
        'jms-btn-edit-transaction': { mod: 'JmsTgTransactionControllerUi', cards: '.jms-transaction-card', method: 'openEditor' },
        'jms-btn-edit-loop': { mod: 'JmsTgLoopControllerUi', cards: '.jms-loop-card,.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-random': { mod: 'JmsTgRandomControllerUi', cards: '.jms-random-card', method: 'openEditor' },
        'jms-btn-edit-simple': { mod: 'JmsTgSimpleControllerUi', cards: '.jms-simple-card', method: 'openEditor' },
        'jms-btn-edit-beanshell': { mod: 'JmsTgBeanshellPostUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false] },
        'jms-btn-edit-debug': { mod: 'JmsTgDebugSamplerUi', cards: '.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-tg-xpath-extract': { mod: 'JmsTgXpathExtractUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false] },
        'jms-btn-edit-tg-regex-extract': { mod: 'JmsTgRegexExtractUi', cards: '.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-tg-jdbc-post': { mod: 'JmsTgJdbcPostUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false, 0] },
        'jms-btn-edit-tg-json-extract': { mod: 'JmsTgJsonExtractUi', cards: '.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-tg-jsr223-post': { mod: 'JmsTgJsr223PostUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false] }
    };

    function isJmeterStudio() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function resolveCard(btn, route) {
        var sels = (route.cards || '').split(',');
        for (var i = 0; i < sels.length; i++) {
            var card = btn.closest(sels[i].trim());
            if (card) return card;
        }
        return null;
    }

    function ensureModalOnBody(Ui) {
        if (!Ui) return;
        if (typeof Ui.ensureModal === 'function') {
            var modal = Ui.ensureModal();
            if (global.JmsStudioV2TreeStepEditUnify && typeof global.JmsStudioV2TreeStepEditUnify.ensureOnBody === 'function') {
                global.JmsStudioV2TreeStepEditUnify.ensureOnBody(modal);
            } else if (modal && modal.parentElement !== global.document.body) {
                global.document.body.appendChild(modal);
            }
            return;
        }
        if (Ui.MODAL_ID) {
            var el = global.document.getElementById(Ui.MODAL_ID);
            if (global.JmsStudioV2TreeStepEditUnify && typeof global.JmsStudioV2TreeStepEditUnify.ensureOnBody === 'function') {
                global.JmsStudioV2TreeStepEditUnify.ensureOnBody(el);
            } else if (el && el.parentElement !== global.document.body) {
                global.document.body.appendChild(el);
            }
        }
    }

    function modalIsOpen(modalId) {
        if (!modalId) return false;
        var modal = global.document.getElementById(modalId);
        return !!(modal && modal.classList.contains('jms-modal-open'));
    }

    function invokeOpen(route, planId, tgId, stepId) {
        var Ui = global[route.mod];
        ensureModalOnBody(Ui);
        if (Ui && typeof Ui[route.method] === 'function') {
            var args = [planId, tgId, stepId].concat(route.extra || []);
            Ui[route.method].apply(Ui, args);
            var mid = (Ui.MODAL_ID || route.modalId);
            if (modalIsOpen(mid)) return true;
        }
        if (route.fallback === 'openIfEditor' && global.JmsVisualBuilder &&
            typeof global.JmsVisualBuilder.openIfEditor === 'function') {
            global.JmsVisualBuilder.openIfEditor(planId, tgId, stepId);
            return modalIsOpen('modal-if-edit');
        }
        return false;
    }

    function onDocClick(ev) {
        if (!isJmeterStudio()) return;
        var btn = null;
        var route = null;
        var keys = Object.keys(EDIT_ROUTES);
        for (var i = 0; i < keys.length; i++) {
            var cls = keys[i];
            var hit = ev.target.closest('.' + cls);
            if (hit) {
                btn = hit;
                route = EDIT_ROUTES[cls];
                break;
            }
        }
        if (!btn || !route) return;

        var card = resolveCard(btn, route);
        if (!card) return;

        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        var stepId = card.getAttribute('data-step-id');
        if (!tgId || !stepId) return;

        var actions = btn.closest('.lth-step-actions');
        if (actions) actions.classList.remove('is-open', 'is-hover');

        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.readModelFromDom === 'function') {
            global.JmsVisualBuilder.readModelFromDom();
        }
        if (!planId) {
            var m0 = global.JmsVisualBuilder && global.JmsVisualBuilder.getModel ? global.JmsVisualBuilder.getModel() : null;
            if (m0 && m0.test_plans && m0.test_plans[0]) planId = m0.test_plans[0].id;
        }
        var opened = invokeOpen(route, planId, tgId, stepId);
        if (!opened) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
    }

    function bind() {
        if (!isJmeterStudio()) return;
        if (global.document.body.dataset.jmsStepEditBridgeBound === '1') return;
        global.document.body.dataset.jmsStepEditBridgeBound = '1';
        global.document.addEventListener('click', onDocClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsStudioV2StepEditBridge = { bind: bind, invokeOpen: invokeOpen, EDIT_ROUTES: EDIT_ROUTES };
})(window);

/* ---- js/jms_studio_v2_tree_step_edit_unify.js ---- */
/**
 * Studio v2 · 编辑弹窗兜底：挂 body、Esc/遮罩关闭（JMeter Tab 全部配置弹窗）
 */
(function (global) {
    'use strict';

    var EDIT_MODAL_IDS = [
        'modal-tg-load', 'modal-tg-http-mgr',
        'modal-step-edit', 'modal-step-assert', 'modal-if-edit', 'modal-beanshell-edit', 'modal-debug-edit',
        'modal-http-jdbc-post-proc-edit', 'modal-tg-jdbc-post-edit', 'modal-tg-if-edit',
        'modal-if-mount-timer-edit', 'modal-http-if-edit', 'modal-http-step-user-params-edit',
        'modal-tg-transaction-edit', 'modal-tg-loop-edit', 'modal-tg-xpath-extract-edit',
        'modal-tg-json-extract-edit', 'modal-tg-regex-extract-edit', 'modal-tg-jsr223-post-edit'
    ];

    function isJmeterStudio() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function ensureOnBody(modal) {
        if (modal && modal.parentElement !== global.document.body) {
            global.document.body.appendChild(modal);
        }
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function bindModal(modal) {
        if (!modal || modal.dataset.jmsStudioEditModalBound === '1') return;
        modal.dataset.jmsStudioEditModalBound = '1';
        ensureOnBody(modal);
        modal.addEventListener('click', function (ev) {
            if (!isJmeterStudio()) return;
            if (ev.target === modal) closeModal(modal);
        });
    }

    function bindAll() {
        if (!isJmeterStudio()) return;
        EDIT_MODAL_IDS.forEach(function (id) {
            bindModal(global.document.getElementById(id));
        });
        global.document.querySelectorAll('[id^="modal-tg-"], [id^="modal-http-"]').forEach(function (el) {
            if (el.id) bindModal(el);
        });
    }

    function watchDynamicModals() {
        if (!isJmeterStudio()) return;
        if (global.document.body.dataset.jmsStudioEditModalObs === '1') return;
        global.document.body.dataset.jmsStudioEditModalObs = '1';
        new MutationObserver(function () { bindAll(); }).observe(global.document.body, { childList: true, subtree: true });
    }

    global.document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape' || !isJmeterStudio()) return;
        var closed = false;
        EDIT_MODAL_IDS.forEach(function (id) {
            var modal = global.document.getElementById(id);
            if (modal && modal.classList.contains('jms-modal-open')) {
                closeModal(modal);
                closed = true;
            }
        });
        if (!closed) {
            global.document.querySelectorAll('[id^="modal-tg-"].jms-modal-open, [id^="modal-http-"].jms-modal-open').forEach(function (modal) {
                closeModal(modal);
                closed = true;
            });
        }
        if (closed) ev.preventDefault();
    });

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', function () { bindAll(); watchDynamicModals(); });
    } else {
        bindAll();
        watchDynamicModals();
    }
    global.addEventListener('pageshow', bindAll);

    global.JmsStudioV2TreeStepEditUnify = { bind: bindAll, ensureOnBody: ensureOnBody };
})(window);

/* ---- js/jms_catalog_sampler_ctrl_expand_ui.js ---- */
/**
 * JMeter · 取样器/逻辑控制器整卡点击展开/收缩（隔离模块，不修改原有 toggle 模块）
 */
(function (global) {
    'use strict';

    var LOGIC_CARD_SEL = '.jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card';
    var LOGIC_HEAD_SEL = '.jms-if-card__head, .jms-random-card__head, .jms-simple-card__head, .jms-transaction-card__head, .jms-loop-card__head';
    var CATALOG_CARD_SEL = '.jms-catalog-card--expandable';

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isBlocked(target) {
        if (!target || !target.closest) return true;
        return !!target.closest(
            'button, a, input, select, textarea, label, [role="menuitem"],' +
            ' .jms-tree-drag-handle, .jms-btn-edit-catalog, .jms-btn-del-catalog,' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-tg-tree-inline-actions, .jms-http-context, .jms-http-card,' +
            ' .jms-catalog-mount-context, .jms-catalog-mount-ctx-more, .jms-catalog-mount-ctx-btn,' +
            ' .jms-if-mount-context, .jms-if-mount-ctx-btn, .jms-if-mount-ctx-item, .jms-if-mount-ctx-menu,' +
            ' .jms-http-mount-children, .jms-tree-node--http-mount,' +
            ' .jms-if-mount-row-actions, .jms-if-mount-row-edit, .jms-if-mount-row-del, .jms-tree-node--if-mount',
            ' .jms-v2-catalog-popup, .jms-v2-catalog-popup__item'
        );
    }

    function stopClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    }

    function toggleCatalogCard(card) {
        var T = global.JmsCatalogCardToggle;
        if (T && typeof T.toggleCard === 'function') {
            T.toggleCard(card);
            return;
        }
        card.classList.toggle('jms-catalog-card--collapsed');
        card.setAttribute('aria-expanded', card.classList.contains('jms-catalog-card--collapsed') ? 'false' : 'true');
    }

    function toggleLogicCard(card) {
        var L = global.JmsLogicCtrlCardToggle;
        if (L && typeof L.toggleCard === 'function') {
            L.toggleCard(card);
            return;
        }
        var body = card.querySelector('.jms-if-card__body, .jms-random-card__body, .jms-simple-card__body, .jms-transaction-card__body, .jms-loop-card__body');
        if (!body) return;
        var hide = body.style.display !== 'none';
        body.style.display = hide ? 'none' : '';
    }

    function resolveCatalogCard(target) {
        if (isBlocked(target)) return null;
        var card = target.closest(CATALOG_CARD_SEL);
        return card || null;
    }

    function resolveLogicCard(target) {
        if (isBlocked(target)) return null;
        var card = target.closest(LOGIC_CARD_SEL);
        if (!card) return null;
        if (target.closest(LOGIC_HEAD_SEL)) return card;
        if (target.closest('.jms-if-card__body, .jms-random-card__body, .jms-simple-card__body, .jms-transaction-card__body, .jms-loop-card__body')) {
            return null;
        }
        if (target.closest('.jms-if-mount-context')) return null;
        return card;
    }

    function onClick(ev) {
        if (!isTreeView()) return;
        var t = ev.target;

        var catalogCard = resolveCatalogCard(t);
        if (catalogCard) {
            stopClick(ev);
            toggleCatalogCard(catalogCard);
            return;
        }

        var logicCard = resolveLogicCard(t);
        if (logicCard) {
            stopClick(ev);
            toggleLogicCard(logicCard);
        }
    }

    function bind() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsCatalogSamplerCtrlExpandBound === '1') return;
        root.dataset.jmsCatalogSamplerCtrlExpandBound = '1';
        root.addEventListener('click', onClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsCatalogSamplerCtrlExpandUi = { bind: bind };
})(window);

/* ---- js/jms_catalog_mount_menu_bridge.js ---- */
/**
 * JMeter catalog · 挂载区菜单桥接（扩展 CatalogMenuV2，隔离模块）
 */
(function (global) {
    'use strict';

    var CATALOG_MOUNT_HIJACKS = [
        { wrap: '.jms-catalog-mount-ctx-sampler-more', trigger: '.jms-catalog-mount-ctx-btn-sampler', category: 'sampler', label: '取样器' },
        { wrap: '.jms-catalog-mount-ctx-logic-more', trigger: '.jms-catalog-mount-ctx-btn-logic', category: 'controller', label: '逻辑控制器' },
        { wrap: '.jms-catalog-mount-ctx-config-more', trigger: '.jms-catalog-mount-ctx-btn-config', category: 'config', label: '配置元件' },
        { wrap: '.jms-catalog-mount-ctx-preproc-more', trigger: '.jms-catalog-mount-ctx-btn-preproc', category: 'preprocessor', label: '前置处理器' },
        { wrap: '.jms-catalog-mount-ctx-timer-more', trigger: '.jms-catalog-mount-ctx-btn-timer', category: 'timer', label: '定时器' },
        { wrap: '.jms-catalog-mount-ctx-proc-more', trigger: '.jms-catalog-mount-ctx-btn-processors', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-catalog-mount-ctx-assert-more', trigger: '.jms-catalog-mount-ctx-btn-assert', category: 'assertion', label: '断言' },
        { wrap: '.jms-catalog-mount-ctx-listener-more', trigger: '.jms-catalog-mount-ctx-btn-listeners', category: 'listener', label: '监听器' }
    ];

    function ctxFromCatalogMountWrap(wrap) {
        var mountCtx = wrap && wrap.closest ? wrap.closest('.jms-catalog-mount-context') : null;
        if (!mountCtx) return null;
        var mode = mountCtx.getAttribute('data-catalog-mount-mode') || '';
        var stepId = mountCtx.getAttribute('data-catalog-step-id') || mountCtx.getAttribute('data-if-step-id') || '';
        if (!stepId) return null;
        if (mode === 'sampler') {
            return {
                context: 'sampler_child',
                label: '取样器',
                planId: mountCtx.getAttribute('data-plan-id'),
                tgId: mountCtx.getAttribute('data-tg-id'),
                parentStepId: stepId,
                httpMount: true
            };
        }
        if (mode === 'controller') {
            return {
                context: 'controller',
                label: '逻辑控制器',
                planId: mountCtx.getAttribute('data-plan-id'),
                tgId: mountCtx.getAttribute('data-tg-id'),
                parentStepId: stepId,
                controllerMount: true
            };
        }
        return null;
    }

    function patchMenuV2() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || Menu.__catalogMountBridgePatched) return;
        Menu.__catalogMountBridgePatched = true;

        var origInit = Menu.init;
        Menu.init = function () {
            if (typeof origInit === 'function') origInit.apply(this, arguments);
            CATALOG_MOUNT_HIJACKS.forEach(function (h) {
                global.document.querySelectorAll(h.wrap + ':not([data-v2-hijack])').forEach(function (el) {
                    el.setAttribute('data-v2-hijack', '1');
                    var menu = el.querySelector('.jms-catalog-mount-ctx-menu');
                    if (menu) menu.setAttribute('aria-hidden', 'true');
                });
            });
        };

        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-jmeter-catalog-v2')) return;
            var t = ev.target;
            var hit = null;
            CATALOG_MOUNT_HIJACKS.forEach(function (h) {
                if (!hit && t.closest(h.trigger)) hit = h;
            });
            if (!hit) return;
            var wrap = t.closest(hit.wrap);
            var trigger = t.closest(hit.trigger);
            if (!wrap || !trigger) return;
            var ctx = ctxFromCatalogMountWrap(wrap);
            if (!ctx) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            var triggerKey = (ctx.planId || '') + ':' + (ctx.tgId || '') + ':' + hit.category + ':catalog-mount:' + (ctx.parentStepId || '');
            if (typeof Menu.openPopup === 'function') {
                Menu.openPopup(trigger, ctx, hit.category, hit.label, {
                    wrap: hit.wrap,
                    menu: '.jms-catalog-mount-ctx-menu',
                    trigger: hit.trigger
                }, triggerKey);
            } else if (typeof Menu.loadCatalog === 'function') {
                Menu.loadCatalog(function (err) {
                    if (err) {
                        if (typeof global.hfFloatToast === 'function') {
                            global.hfFloatToast('元件目录暂不可用', { variant: 'warning' });
                        }
                        return;
                    }
                });
            }
        }, true);
    }

    function bind() {
        patchMenuV2();
        if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.init === 'function') {
            global.JmsCatalogMenuV2.init();
        }
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        setTimeout(bind, 80);
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogMountMenuBridge = { bind: bind, ctxFromCatalogMountWrap: ctxFromCatalogMountWrap };
})(window);

/* ---- js/jms_catalog_sampler_mount_refresh.js ---- */
/**
 * catalog 取样器 · 挂载行局部刷新（展开卡片 / 删除后，二/三/四级嵌套）
 */
(function (global) {
    'use strict';

    var R = function () { return global.JmsMountHostResolver; };
    var M = function () { return global.JmsIfMountModel; };

    function findCatalogSamplerCard(stepsEl, stepId) {
        if (!stepsEl || !stepId) return null;
        return stepsEl.querySelector(
            '.jms-catalog-card--sampler[data-step-id="' + stepId + '"],' +
            ' .jms-aux-card--debug.jms-catalog-card[data-step-id="' + stepId + '"]'
        );
    }

    function resolveMountDepth(stepsEl, stepId, fallbackDepth) {
        if (!stepsEl || !stepId) return fallbackDepth || 1;
        var node = stepsEl.querySelector('.jms-tree-node--catalog[data-step-id="' + stepId + '"]');
        if (!node) return fallbackDepth || 1;
        return (parseInt(node.getAttribute('data-depth') || '0', 10) || 0) + 1;
    }

    function patchCatalogSamplerMountsInDom(stepsEl, step, planId, tgId) {
        if (!stepsEl || !step || !step.id) return false;
        var card = findCatalogSamplerCard(stepsEl, step.id);
        if (!card) return false;
        var body = card.querySelector(':scope > .jms-catalog-card__body');
        if (!body) return false;
        var Rows = global.JmsTgIfMountTreeRows;
        if (!Rows || typeof Rows.renderRows !== 'function') return false;
        if (M() && typeof M().ensureMountFields === 'function') step = M().ensureMountFields(step);
        var depth = resolveMountDepth(stepsEl, step.id, 1);
        Array.prototype.slice.call(body.querySelectorAll(':scope > .jms-tree-node--if-mount, :scope > .jms-empty-hint.jms-catalog-card__empty')).forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        var html = Rows.renderRows(step, planId, tgId, depth, step.id);
        if (html) {
            body.insertAdjacentHTML('beforeend', html);
            return true;
        }
        if (!body.querySelector(':scope > .jms-tree-node')) {
            body.insertAdjacentHTML('beforeend', '<p class="jms-empty-hint jms-catalog-card__empty">暂无挂载元件</p>');
        }
        return true;
    }

    function patchByStepId(planId, tgId, stepId) {
        if (!planId || !tgId || !stepId) return false;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        if (!card) return false;
        var stepsEl = card.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        var model = global.JmsVisualBuilder && global.JmsVisualBuilder.getModel ? global.JmsVisualBuilder.getModel() : null;
        if (!R() || typeof R().findMountHostStep !== 'function') return false;
        var step = R().findMountHostStep(model, planId, tgId, stepId);
        if (!step || !R().isCatalogSamplerMountHost(step)) return false;
        return patchCatalogSamplerMountsInDom(stepsEl, step, planId, tgId);
    }

    function onCatalogCardExpanded(card) {
        if (!card || card.classList.contains('jms-catalog-card--collapsed')) return;
        var stepId = card.getAttribute('data-step-id');
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        if (!stepId) return;
        global.setTimeout(function () { patchByStepId(planId, tgId, stepId); }, 0);
    }

    function hookCatalogToggle() {
        var T = global.JmsCatalogCardToggle;
        if (!T || T.__catalogSamplerMountPatched) return;
        T.__catalogSamplerMountPatched = true;
        var origToggle = T.toggleCard;
        if (typeof origToggle === 'function') {
            T.toggleCard = function (card) {
                origToggle.call(T, card);
                if (card && !card.classList.contains('jms-catalog-card--collapsed')) onCatalogCardExpanded(card);
            };
        }
    }

    function bind() { hookCatalogToggle(); }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogSamplerMountRefresh = {
        patchCatalogSamplerMountsInDom: patchCatalogSamplerMountsInDom,
        patchByStepId: patchByStepId,
        onCatalogCardExpanded: onCatalogCardExpanded
    };
})(window);

/* ---- js/jms_catalog_sampler_mount_post_add_fix_v1.js ---- */
/**
 * catalog 取样器挂载 · 添加后刷新修复（DebugSampler 等非 HTTP 取样器）
 */
(function (global) {
    'use strict';

    function isCatalogSamplerMount(insertCtx, planId, tgId, samplerId) {
        if (!samplerId || !insertCtx) return false;
        if (!(insertCtx.httpMount || insertCtx.context === 'sampler_child' || insertCtx.context === 'sampler')) {
            return false;
        }
        var R = global.JmsMountHostResolver;
        var vb = global.JmsVisualBuilder;
        if (!R || !vb || typeof vb.getModel !== 'function') return false;
        var host = R.findMountHostStep(vb.getModel(), planId, tgId, samplerId);
        return !!(host && R.isCatalogSamplerMountHost(host) && !host.method);
    }

    function refreshCatalogSamplerMount(planId, tgId, samplerId) {
        if (!planId || !tgId || !samplerId) return false;
        if (global.JmsCatalogSamplerMountRefresh &&
            typeof global.JmsCatalogSamplerMountRefresh.patchByStepId === 'function') {
            if (global.JmsCatalogSamplerMountRefresh.patchByStepId(planId, tgId, samplerId)) return true;
        }
        if (global.JmsTgIfMountRefresh &&
            typeof global.JmsTgIfMountRefresh.markDirtyAndRefresh === 'function') {
            return global.JmsTgIfMountRefresh.markDirtyAndRefresh(planId, tgId, samplerId);
        }
        return false;
    }

    function patchPostAdd() {
        var PA = global.JmsCatalogPostAdd;
        if (!PA || PA.__catalogSamplerMountRefreshPatched) return;
        PA.__catalogSamplerMountRefreshPatched = true;
        var orig = PA.refreshAfterSave;
        PA.refreshAfterSave = function (vb, planId, tgId, step, insertCtx) {
            insertCtx = insertCtx || {};
            var samplerId = insertCtx.parentStepId;
            var catalogSampler = isCatalogSamplerMount(insertCtx, planId, tgId, samplerId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            if (catalogSampler && samplerId) {
                global.setTimeout(function () {
                    refreshCatalogSamplerMount(planId, tgId, samplerId);
                    var card = global.document.querySelector(
                        '.jms-aux-card--debug.jms-catalog-card[data-step-id="' + samplerId + '"],' +
                        ' .jms-catalog-card--sampler[data-step-id="' + samplerId + '"]'
                    );
                    if (card && card.classList.contains('jms-catalog-card--collapsed') &&
                        global.JmsCatalogCardToggle && typeof global.JmsCatalogCardToggle.toggleCard === 'function') {
                        global.JmsCatalogCardToggle.toggleCard(card);
                    }
                }, 80);
            }
        };
    }

    function patchAppend() {
        var SC = global.JmsCatalogSamplerChildren;
        if (!SC || SC.__catalogSamplerMountAppendPatched) return;
        SC.__catalogSamplerMountAppendPatched = true;
        var orig = SC.appendUnderMountHost;
        if (typeof orig !== 'function') return;
        SC.appendUnderMountHost = function (vb, planId, tgId, hostStepId, stepData) {
            var item = orig.apply(this, arguments);
            if (!item) return item;
            var host = SC.findMountHostStep(vb.getModel(), planId, tgId, hostStepId);
            if (host && global.JmsMountCatalogBridge) {
                var idx = (host.catalog_hash_children || []).length - 1;
                if (idx >= 0) {
                    var key = global.JmsMountCatalogBridge.hashMountKey(item, idx);
                    if (global.JmsIfMountTimeline && typeof global.JmsIfMountTimeline.assignAppendMountKey === 'function') {
                        global.JmsIfMountTimeline.assignAppendMountKey(host, key);
                    }
                    if (global.JmsIfMountSaveHelper && typeof global.JmsIfMountSaveHelper.notifyMountAdded === 'function') {
                        global.JmsIfMountSaveHelper.notifyMountAdded(host, key);
                    }
                }
            }
            return item;
        };
    }

    function patchBridgeV2Allow() {
        var B = global.JmsStudioCatalogBridgeV2;
        if (!B || B.__catalogSamplerAllowPatched) return;
        B.__catalogSamplerAllowPatched = true;
        var orig = B.isAllowedForMount;
        if (typeof orig !== 'function') return;
        B.isAllowedForMount = function (comp, ctx, category) {
            if (ctx && ctx.httpMount && ctx.parentStepId &&
                isCatalogSamplerMount(ctx, ctx.planId, ctx.tgId, ctx.parentStepId)) {
                if (global.JmsHierarchyRules && typeof global.JmsHierarchyRules.componentAllowed === 'function') {
                    return global.JmsHierarchyRules.componentAllowed(comp, 'sampler_child');
                }
                return true;
            }
            return orig.apply(this, arguments);
        };
    }

    function patchMenuBridge() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || Menu.__catalogMountMenuPriorityPatched) return;
        Menu.__catalogMountMenuPriorityPatched = true;
        var origOpen = Menu.openPopup;
        if (typeof origOpen !== 'function') return;
        Menu.openPopup = function (anchor, ctx, category, title, hit, triggerKey) {
            if (ctx && ctx.httpMount && ctx.parentStepId) {
                var R = global.JmsMountHostResolver;
                var vb = global.JmsVisualBuilder;
                if (R && vb && typeof vb.getModel === 'function') {
                    var host = R.findMountHostStep(vb.getModel(), ctx.planId, ctx.tgId, ctx.parentStepId);
                    if (host && R.isCatalogSamplerMountHost(host) && !host.method) {
                        ctx = Object.assign({}, ctx, {
                            context: 'sampler_child',
                            label: '取样器',
                            httpMount: true
                        });
                    }
                }
            }
            return origOpen.call(Menu, anchor, ctx, category, title, hit, triggerKey);
        };
    }

    function bind() {
        patchPostAdd();
        patchAppend();
        patchBridgeV2Allow();
        patchMenuBridge();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogSamplerMountPostAddFix = { bind: bind };
})(window);

/* ---- js/jms_sampler_listener_mount_v1.js ---- */
/**
 * 取样器挂载 · 官方监听器菜单放行（隔离模块）
 * 背景：catalog HTTPSamplerProxy 常无 step.method，会被 sampler_mount_post_add_fix
 * 改走 HierarchyRules.sampler_child（禁止 listener）导致菜单为空。
 * 本模块仅放宽取样器挂载菜单/添加白名单，不改 HierarchyRules 与 TG 级监听器。
 */
(function (global) {
    'use strict';

    var VER = '20260715sampler-listener1';

    /** 官方 / 常用可挂到取样器下的监听器 alias */
    var SAMPLER_LISTENER_ALLOW = {
        ViewResultsFullVisualizer: 1,
        StatVisualizer: 1,
        SummaryReport: 1,
        ResultCollector: 1,
        BackendListener: 1,
        GraphVisualizer: 1,
        TableVisualizer: 1,
        SimpleDataWriter: 1,
        MailerResultCollector: 1,
        JSR223Listener: 1,
        BeanShellListener: 1,
        Summariser: 1,
        ResultAction: 1
    };

    function isSamplerMountCtx(ctx) {
        if (!ctx) return false;
        if (ctx.httpMount) return true;
        var c = String(ctx.context || '');
        return c === 'sampler_child' || c === 'sampler';
    }

    function isListenerComp(comp, category) {
        if (category === 'listener') return true;
        return !!(comp && String(comp.category || '') === 'listener');
    }

    function allowedSamplerListener(comp) {
        if (!comp) return false;
        var alias = String(comp.alias || '');
        if (SAMPLER_LISTENER_ALLOW[alias]) return true;
        // 其余 listener 类别也允许（对齐 JMeter：取样器可挂监听器）
        return String(comp.category || '') === 'listener';
    }

    function patchBridgeAllow() {
        var B = global.JmsStudioCatalogBridgeV2;
        if (!B || typeof B.isAllowedForMount !== 'function' || B.__samplerListenerMountV1) return false;
        B.__samplerListenerMountV1 = true;
        var orig = B.isAllowedForMount.bind(B);
        B.isAllowedForMount = function (comp, ctx, category) {
            if (isSamplerMountCtx(ctx) && isListenerComp(comp, category) && allowedSamplerListener(comp)) {
                return true;
            }
            return orig(comp, ctx, category);
        };
        return true;
    }

    /** 目录已加载但缺 GUI 别名时，前端旁路补齐（双保险） */
    function patchMenuCatalogInject() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || typeof Menu.loadCatalog !== 'function' || Menu.__samplerListenerCatalogInjectV1) return false;
        Menu.__samplerListenerCatalogInjectV1 = true;
        var orig = Menu.loadCatalog.bind(Menu);
        Menu.loadCatalog = function (cb) {
            return orig(function (err) {
                try {
                    if (!err && Menu.getCatalogState) {
                        /* no-op, state private */
                    }
                    // 通过打开前注入：劫持 filterComps 更稳
                } catch (e1) { /* ignore */ }
                if (typeof cb === 'function') cb(err);
            });
        };
        return true;
    }

    function patchFilterComps() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || Menu.__samplerListenerFilterV1) return false;
        // filterComps 未导出；依赖 isAllowedForMount 已足够
        Menu.__samplerListenerFilterV1 = true;
        return true;
    }

    function bind() {
        patchBridgeAllow();
        patchMenuCatalogInject();
        patchFilterComps();
    }

    function boot(n) {
        n = n || 0;
        bind();
        if ((!global.JmsStudioCatalogBridgeV2 || !global.JmsStudioCatalogBridgeV2.__samplerListenerMountV1) && n < 80) {
            setTimeout(function () { boot(n + 1); }, 50);
        }
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', function () { boot(0); });
    } else {
        boot(0);
    }
    global.addEventListener('pageshow', function () { boot(0); });

    global.JmsSamplerListenerMountV1 = {
        VER: VER,
        SAMPLER_LISTENER_ALLOW: SAMPLER_LISTENER_ALLOW,
        allowedSamplerListener: allowedSamplerListener,
        isSamplerMountCtx: isSamplerMountCtx,
        bind: bind
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_catalog_mount_context_ui.js ---- */
/**
 * JMeter catalog · 取样器/逻辑控制器挂载区工具栏（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isCatalogSampler(step) {
        if (!step || step.container) return false;
        if (step.method) return true;
        if (step.type !== 'catalog_element') return false;
        if (step.alias === 'DebugSampler') return true;
        return step.category === 'sampler';
    }

    function isCatalogController(step) {
        if (!step || step.type !== 'catalog_element') return false;
        return !!step.container;
    }

    function renderDropdown(btnClass, btnLabel, menuClass) {
        return '<div class="' + menuClass + ' jms-catalog-mount-ctx-more">' +
            '<button type="button" class="jms-catalog-mount-ctx-btn ' + btnClass + '">' +
            esc(btnLabel) + '<span class="jms-catalog-mount-ctx-caret">▾</span></button>' +
            '<div class="jms-catalog-mount-ctx-menu" aria-hidden="true"></div></div>';
    }

    function renderSamplerToolbar(stepId) {
        var sid = esc(stepId);
        return '<div class="jms-if-mount-context__toolbar jms-catalog-mount-context__toolbar" data-catalog-step-id="' + sid + '">' +
            renderDropdown('jms-catalog-mount-ctx-btn-config', '配置元件', 'jms-catalog-mount-ctx-config-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-preproc', '前置处理器', 'jms-catalog-mount-ctx-preproc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-timer', '定时器', 'jms-catalog-mount-ctx-timer-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-processors', '后置处理器', 'jms-catalog-mount-ctx-proc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-assert', '断言', 'jms-catalog-mount-ctx-assert-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-listeners', '监听器', 'jms-catalog-mount-ctx-listener-more') +
            '</div>';
    }

    function renderControllerToolbar(stepId) {
        var sid = esc(stepId);
        return '<div class="jms-if-mount-context__toolbar jms-catalog-mount-context__toolbar" data-catalog-step-id="' + sid + '">' +
            renderDropdown('jms-catalog-mount-ctx-btn-sampler', '取样器', 'jms-catalog-mount-ctx-sampler-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-logic', '逻辑控制器', 'jms-catalog-mount-ctx-logic-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-config', '配置元件', 'jms-catalog-mount-ctx-config-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-preproc', '前置处理器', 'jms-catalog-mount-ctx-preproc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-timer', '定时器', 'jms-catalog-mount-ctx-timer-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-processors', '后置处理器', 'jms-catalog-mount-ctx-proc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-assert', '断言', 'jms-catalog-mount-ctx-assert-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-listeners', '监听器', 'jms-catalog-mount-ctx-listener-more') +
            '</div>';
    }

    function renderPanel(step, planId, tgId) {
        if (!isTreeView() || !step || step.type !== 'catalog_element') return '';
        var mode = '';
        if (isCatalogSampler(step)) mode = 'sampler';
        else if (isCatalogController(step)) mode = 'controller';
        if (!mode) return '';
        var toolbar = mode === 'sampler'
            ? renderSamplerToolbar(step.id)
            : renderControllerToolbar(step.id);
        return '<div class="jms-if-mount-context jms-if-mount-context--toolbar-only jms-catalog-mount-context jms-catalog-mount-context--' + mode + '"' +
            ' data-plan-id="' + esc(planId) + '"' +
            ' data-tg-id="' + esc(tgId) + '"' +
            ' data-catalog-step-id="' + esc(step.id) + '"' +
            ' data-catalog-mount-mode="' + mode + '">' + toolbar + '</div>';
    }

    global.JmsCatalogMountContextUi = {
        renderPanel: renderPanel,
        isCatalogSampler: isCatalogSampler,
        isCatalogController: isCatalogController
    };
})(window);

/* ---- js/jms_tg_config_menu_ui.js ---- */
/**
 * 树形视图 · 线程组配置元件下拉菜单（隔离模块，仅 lth-tg-view-tree）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsTgConfigCatalog;

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function closePeerMenus() {
        global.document.querySelectorAll(
            '.jms-tg-listener-more.is-open, .jms-tg-logic-ctrl-more.is-open, .jms-tg-post-proc-more.is-open,' +
            ' .jms-http-ctx-listener-more.is-open, .jms-http-ctx-preproc-more.is-open,' +
            ' .jms-http-ctx-proc-more.is-open, .jms-http-ctx-timer-more.is-open,' +
            ' .jms-http-ctx-config-more.is-open, .lth-tg-add-more.is-open, .jms-tg-sampler-more.is-open'
        ).forEach(function (el) {
            el.classList.remove('is-open');
            var tr = el.querySelector(
                '.jms-tg-listener-menu-trigger, .jms-tg-logic-ctrl-trigger,' +
                ' .jms-tg-post-proc-trigger, .jms-tg-sampler-trigger'
            );
            if (tr) tr.setAttribute('aria-expanded', 'false');
        });
    }

    function closeMenus(except) {
        global.document.querySelectorAll('.jms-tg-config-more.is-open').forEach(function (el) {
            if (el !== except) {
                el.classList.remove('is-open');
                var tr = el.querySelector('.jms-tg-config-trigger');
                if (tr) tr.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function closeAllMenus() {
        closeMenus(null);
    }

    function renderMenu(tg, planId) {
        var cfgOn = Catalog && typeof Catalog.anyItems === 'function' ? Catalog.anyItems(tg) : false;
        var keys = Catalog && Catalog.CONFIG_KEYS ? Catalog.CONFIG_KEYS : [
            'http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'
        ];
        var labels = Catalog && Catalog.LABELS ? Catalog.LABELS : {
            http_defaults: 'HTTP 请求默认值',
            header_manager: 'HTTP 请求头管理器',
            auth_manager: 'HTTP 授权管理器',
            cookie_manager: 'HTTP Cookie 管理器',
            cache_manager: 'HTTP 缓存管理器',
            csv_data_set: 'CSV 数据文件设置',
            counter: '计数器'
        };
        var items = '';
        return '<div class="jms-tg-config-more" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<button type="button" class="jms-tg-config-trigger jms-tg-tree-btn-ghost' + (cfgOn ? ' is-on' : '') + '" title="配置元件" aria-haspopup="true" aria-expanded="false">' +
            '配置元件<span class="jms-tg-config-caret" aria-hidden="true">▾</span></button>' +
            '<div class="jms-tg-config-menu" role="menu">' + items + '</div></div>';
    }

    function onDocumentClick(ev) {
        if (!isTreeView()) return;
        if (global.document.body.classList.contains('lth-jmeter-catalog-v2')) return;
        var t = ev.target;

        if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.closePopup === 'function') {
            global.JmsCatalogMenuV2.closePopup();
        }

        var trigger = t.closest('.jms-tg-config-trigger');
        if (trigger) {
            ev.preventDefault();
            ev.stopPropagation();
            if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.closePopup === 'function') {
                global.JmsCatalogMenuV2.closePopup();
            }
            if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.closeAllNativeTgMenus === 'function') {
                global.JmsCatalogMenuV2.closeAllNativeTgMenus();
            }
            var wrap = trigger.closest('.jms-tg-config-more');
            if (!wrap) return;
            var open = wrap.classList.contains('is-open');
            closePeerMenus();
            closeMenus(wrap);
            wrap.classList.toggle('is-open', !open);
            trigger.setAttribute('aria-expanded', !open ? 'true' : 'false');
            return;
        }

        var menuItem = t.closest('.jms-tg-config-menu-item');
        if (menuItem) {
            ev.preventDefault();
            ev.stopPropagation();
            var w = menuItem.closest('.jms-tg-config-more');
            if (!w) return;
            var planId = w.getAttribute('data-plan-id');
            var tgId = w.getAttribute('data-tg-id');
            var typeKey = menuItem.getAttribute('data-config-type');
            closeAllMenus();
            if (planId && tgId && typeKey && global.JmsTgConfigUi && typeof global.JmsTgConfigUi.openDrawer === 'function') {
                global.JmsTgConfigUi.openDrawer(planId, tgId, typeKey);
            }
            return;
        }

        if (!t.closest('.jms-tg-config-more')) closeAllMenus();
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsTgConfigMenuBound === '1') return;
        global.document.body.dataset.jmsTgConfigMenuBound = '1';
        global.document.addEventListener('click', onDocumentClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgConfigMenuUi = { renderMenu: renderMenu, closeAllMenus: closeAllMenus };
})(window);

/* ---- js/jms_tg_catalog_element_plan.js ---- */
/**
 * JMeter catalog · legacy 网格步骤卡片渲染（隔离模块，不影响树形 renderRow）
 */
(function (global) {
    'use strict';

    function esc(s) {
        if (global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.esc === 'function') {
            return global.JmsTgTreeRenderer.esc(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function countChildren(step) {
        var n = 0;
        (step.children || []).forEach(function (c) {
            if (!c) return;
            n += 1;
            if (c.children) n += countChildren(c);
        });
        return n;
    }

    function renderActions(planId, tgId, stepId) {
        return '<button type="button" class="jms-btn-ghost jms-btn-edit-catalog" title="编辑">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog jms-tree-del" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(stepId) + '" title="删除">×</button>';
    }

    function renderPlanCard(step, planId, tgId, renderChild) {
        if (!step || step.type !== 'catalog_element') return '';
        var container = !!step.container;
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var badge = esc((step.category || 'cat').slice(0, 3).toUpperCase());
        var childCount = countChildren(step);
        var meta = step.alias ? esc(step.alias) : '';
        var bodyInner = '';
        if (container && typeof renderChild === 'function') {
            bodyInner = (step.children || []).map(function (child) {
                return renderChild(child);
            }).join('');
            if (!bodyInner) {
                bodyInner = '<p class="jms-empty-hint jms-catalog-plan-card__empty">暂无子步骤</p>';
            }
        }
        return '<div class="jms-catalog-plan-card' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<div class="jms-catalog-plan-card__head">' +
            '<span class="jms-catalog-plan-badge">' + badge + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="jms-catalog-plan-card__meta"><code class="hf-mono">' + meta + '</code>' +
            (container ? '<span class="jms-http-assert-badge">' + childCount + ' 个子步骤</span>' : '') +
            '</span>' +
            renderActions(planId, tgId, step.id) +
            '</div>' +
            (container ? '<div class="jms-catalog-plan-card__body">' + bodyInner + '</div>' : '') +
            '</div>';
    }

    global.JmsTgCatalogElementPlan = {
        renderPlanCard: renderPlanCard
    };
})(window);

/* ---- js/jms_tg_catalog_element_native_view.js ---- */
/**
 * JMeter catalog · 树视图原生卡片外观桥接（隔离模块，不影响 legacy 控制器步骤）
 * 将 catalog_element 渲染为与 TXN/LOOP/SIM/RND/Debug 一致的卡片 DOM，保留 catalog 编辑/删除/折叠
 */
(function (global) {
    'use strict';

    var NATIVE_MAP = {
        TransactionController: { node: 'transaction', card: 'jms-transaction-card', badge: 'jms-transaction-badge', badgeText: 'TXN', head: 'jms-transaction-card__head', meta: 'jms-transaction-card__meta', metaText: 'jms-transaction-card__meta-text', childCount: 'jms-transaction-card__child-count', body: 'jms-transaction-card__body', empty: 'jms-transaction-card__empty' },
        LoopController: { node: 'loop', card: 'jms-loop-card', badge: 'jms-loop-badge', badgeText: 'LOOP', head: 'jms-loop-card__head', meta: 'jms-loop-card__meta', metaText: 'jms-loop-card__meta-text', childCount: 'jms-loop-card__child-count', body: 'jms-loop-card__body', empty: 'jms-loop-card__empty' },
        GenericController: { node: 'simple', card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', metaText: 'jms-simple-card__meta-text', childCount: 'jms-simple-card__child-count', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        SimpleController: { node: 'simple', card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', metaText: 'jms-simple-card__meta-text', childCount: 'jms-simple-card__child-count', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        RandomController: { node: 'random', card: 'jms-random-card', badge: 'jms-random-badge', badgeText: 'RND', head: 'jms-random-card__head', meta: 'jms-random-card__meta', metaText: 'jms-random-card__meta-text', childCount: 'jms-random-card__child-count', body: 'jms-random-card__body', empty: 'jms-random-card__empty' }
    };

    function esc(s) {
        if (global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.esc === 'function') {
            return global.JmsTgTreeRenderer.esc(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function renderDragHandle(planId, tgId, stepId, parentStepId) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-step-id="' + esc(stepId) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function countChildren(step) {
        var n = 0;
        (step.children || []).forEach(function (c) {
            if (!c) return;
            n += 1;
            if (c.children) n += countChildren(c);
        });
        return n;
    }

function renderAuxMenuActions(planId, tgId, stepId, editClass, delClass) {
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + editClass + '" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog jms-tree-del" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(stepId) + '" role="menuitem">删除</button>' +
            '</div></div>';
    }

    function renderExpandableHeadToolbar(planId, tgId, step, editClass, delClass, childCount, childCountClass) {
        var actions = renderAuxMenuActions(planId, tgId, step.id, editClass, delClass);
        var E = global.JmsTgTreeStepEnableUnify;
        if (E && typeof E.renderStepToggle === 'function') {
            var toggle = E.renderStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle && typeof E.composeCardToolbar === 'function') {
                actions = E.composeCardToolbar(toggle, actions);
            }
        }
        var S = global.JmsTgTreeHeadBadgeSlots;
        if (S && typeof S.composeLogicHead === 'function') {
            return S.composeLogicHead(childCount, childCountClass, actions);
        }
        return '<div class="jms-card-head-actions">' + actions + '</div>';
    }

    function renderMetaText(step, cfg) {
        var props = step.catalog_props || {};
        if (cfg.node === 'transaction') {
            var parts = [];
            if (props.generate_parent_sample) parts.push('生成父样本');
            if (props.include_timer_duration) parts.push('含定时器耗时');
            return parts.length ? parts.join(' · ') : '标准事务';
        }
        if (cfg.node === 'loop') {
            if (props.loop_forever) return '永远';
            var loops = Number(props.loops);
            return (loops > 0 ? loops : 1) + ' 次';
        }
        if (cfg.node === 'random') {
            return props.ignore_sub_controller_blocks ? '忽略子控制器块' : '标准随机';
        }
        if (props.comments) return String(props.comments).slice(0, 36);
        return '分组容器';
    }


    function renderContainerBodyNative(step, planId, tgId, depth, selectedHttpStepId) {
        var Rows = global.JmsTgIfMountTreeRows;
        var M = global.JmsIfMountModel;
        if (Rows && typeof Rows.renderIfBodyContent === 'function' &&
            M && typeof M.isLogicMountHost === 'function' && M.isLogicMountHost(step)) {
            var mixed = Rows.renderIfBodyContent(step, planId, tgId, (depth || 0) + 1, step.id, selectedHttpStepId || '');
            if (mixed) return mixed;
        }
        return renderChildren(step, planId, tgId, depth, selectedHttpStepId);
    }

    function renderChildren(step, planId, tgId, depth, selectedHttpStepId) {
        if (!global.JmsTgTreeRenderer || typeof global.JmsTgTreeRenderer.renderChildStepNodes !== 'function') {
            return '<p class="jms-empty-hint">暂无子步骤</p>';
        }
        return global.JmsTgTreeRenderer.renderChildStepNodes(
            step.children || [], planId, tgId, depth, step.id, selectedHttpStepId
        ) || '<p class="jms-empty-hint">暂无子步骤</p>';
    }


    function renderMountContextPanel(step, planId, tgId) {
        if (global.JmsCatalogMountContextUi && typeof global.JmsCatalogMountContextUi.renderPanel === 'function') {
            return global.JmsCatalogMountContextUi.renderPanel(step, planId, tgId);
        }
        return '';
    }

    function renderControllerRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId, cfg) {
        depth = depth || 0;
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var childCount = countChildren(step);
        var bodyInner = renderContainerBodyNative(step, planId, tgId, depth, selectedHttpStepId);
        if (!bodyInner) {
            bodyInner = '<p class="jms-empty-hint ' + cfg.empty + '">暂无子步骤</p>';
        }
        var metaText = renderMetaText(step, cfg);
        return '<div class="jms-tree-node jms-tree-node--' + cfg.node + ' jms-tree-node--catalog jms-tree-node--catalog-native" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';" data-step-id="' + esc(step.id) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            renderDragHandle(planId, tgId, step.id, parentStepId) +
            '<div class="jms-tree-node__body">' +
            '<div class="' + cfg.card + ' jms-catalog-card jms-catalog-card--expandable jms-catalog-card--container jms-catalog-card--collapsed' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" data-catalog-native="1" aria-expanded="false">' +
            '<div class="' + cfg.head + ' jms-catalog-card__head">' +
            '<span class="' + cfg.badge + ' jms-catalog-badge">' + cfg.badgeText + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="' + cfg.meta + ' jms-catalog-card__meta">' +
            '<span class="' + cfg.metaText + ' jms-catalog-card__meta-text">' + esc(metaText) + '</span>' +
            '</span>' +
            renderExpandableHeadToolbar(planId, tgId, step, 'jms-btn-edit-catalog', 'jms-btn-del-catalog', childCount, cfg.childCount) +
            '</div>' +
            renderMountContextPanel(step, planId, tgId) +
            '<div class="' + cfg.body + ' jms-catalog-card__body jms-tree-if-children">' + bodyInner + '</div>' +
            '</div></div></div>';
    }


    function renderCatalogSamplerMountBody(step, planId, tgId, depth) {
        if (!step || !global.JmsTgIfMountTreeRows || typeof global.JmsTgIfMountTreeRows.renderRows !== 'function') return '';
        var M = global.JmsIfMountModel;
        if (M && typeof M.isLogicMountHost === 'function' && !M.isLogicMountHost(step)) return '';
        if (M && typeof M.ensureMountFields === 'function') step = M.ensureMountFields(step);
        depth = depth || 1;
        return global.JmsTgIfMountTreeRows.renderRows(step, planId, tgId, depth, step.id) || '';
    }

    function renderDebugRow(step, planId, tgId, depth, parentStepId) {
        depth = depth || 0;
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="jms-tree-node jms-tree-node--debug jms-tree-node--catalog jms-tree-node--catalog-native" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';" data-step-id="' + esc(step.id) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            renderDragHandle(planId, tgId, step.id, parentStepId) +
            '<div class="jms-tree-node__body">' +
            '<div class="jms-aux-card jms-aux-card--debug jms-catalog-card jms-catalog-card--expandable jms-catalog-card--collapsed' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" data-catalog-native="1" aria-expanded="false">' +
            '<div class="jms-catalog-card__head jms-debug-catalog__head">' +
            '<span class="jms-catalog-badge jms-debug-catalog__badge">DEBUG</span>' +
            '<span class="jms-http-name">' + esc(step.name || 'Debug Sampler') + '</span>' +
            '<span class="jms-catalog-card__meta"></span>' +
            renderExpandableHeadToolbar(planId, tgId, step, 'jms-btn-edit-catalog', 'jms-btn-del-catalog', 0, 'jms-tree-child-count-badge') +
            '</div>' +
            renderMountContextPanel(step, planId, tgId) +
            '<div class="jms-catalog-card__body jms-catalog-card__body--summary jms-tree-if-children">' + (renderCatalogSamplerMountBody(step, planId, tgId, depth + 1) || '<p class="jms-empty-hint">点击展开查看挂载区</p>') + '</div>' +
            '</div></div></div>';
    }

    function renderRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        if (!step || step.type !== 'catalog_element' || !step.alias) return '';
        if (step.alias === 'DebugSampler') {
            return renderDebugRow(step, planId, tgId, depth, parentStepId);
        }
        var cfg = NATIVE_MAP[step.alias];
        if (!cfg || !step.container) return '';
        return renderControllerRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId, cfg);
    }

    global.JmsTgCatalogElementNativeView = {
        renderRow: renderRow
    };
})(window);

/* ---- js/jms_tg_catalog_element_plan_v2.js ---- */
/**
 * JMeter catalog · legacy 网格步骤区原生卡片渲染（v2 · 对齐 transaction/loop 卡片）
 */
(function (global) {
    'use strict';

    var CTRL = {
        TransactionController: { card: 'jms-transaction-card', badge: 'jms-transaction-badge', badgeText: 'TXN', head: 'jms-transaction-card__head', meta: 'jms-transaction-card__meta', body: 'jms-transaction-card__body', empty: 'jms-transaction-card__empty' },
        LoopController: { card: 'jms-loop-card', badge: 'jms-loop-badge', badgeText: 'LOOP', head: 'jms-loop-card__head', meta: 'jms-loop-card__meta', body: 'jms-loop-card__body', empty: 'jms-loop-card__empty' },
        GenericController: { card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        SimpleController: { card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        RandomController: { card: 'jms-random-card', badge: 'jms-random-badge', badgeText: 'RND', head: 'jms-random-card__head', meta: 'jms-random-card__meta', body: 'jms-random-card__body', empty: 'jms-random-card__empty' }
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function countSteps(list) {
        var n = 0;
        (list || []).forEach(function (c) {
            if (!c) return;
            n += 1;
            if (c.children && c.children.length) n += countSteps(c.children);
        });
        return n;
    }

    function renderCatalogActions(planId, tgId, stepId) {
        return '<button type="button" class="jms-btn-ghost jms-btn-edit-catalog" title="编辑">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(stepId) + '" title="删除">×</button>';
    }

    function metaText(step, cfg) {
        var props = step.catalog_props || {};
        if (cfg.card === 'jms-transaction-card') {
            var p = [];
            if (props.generate_parent_sample) p.push('生成父样本');
            if (props.include_timer_duration) p.push('含定时器耗时');
            return p.length ? p.join(' · ') : '标准事务';
        }
        if (cfg.card === 'jms-loop-card') {
            if (props.loop_forever) return '永远';
            return (Number(props.loops) > 0 ? Number(props.loops) : 1) + ' 次';
        }
        if (cfg.card === 'jms-random-card') {
            return props.ignore_sub_controller_blocks ? '忽略子控制器块' : '标准随机';
        }
        return props.comments ? String(props.comments).slice(0, 36) : '分组容器';
    }

    function renderController(step, planId, tgId, cfg, renderChild) {
        var childCount = countSteps(step.children);
        var bodyInner = (step.children || []).map(function (child) {
            return renderChild(child);
        }).join('');
        if (!bodyInner) bodyInner = '<p class="jms-empty-hint ' + cfg.empty + '">暂无子步骤</p>';
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="' + cfg.card + ' jms-catalog-plan-native' + disabled + '" data-catalog-native="1" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<div class="' + cfg.head + '">' +
            '<span class="' + cfg.badge + '">' + cfg.badgeText + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="' + cfg.meta + '">' + esc(metaText(step, cfg)) + '</span>' +
            '<span class="jms-http-assert-badge">' + childCount + ' 个子步骤</span>' +
            renderCatalogActions(planId, tgId, step.id) +
            '</div>' +
            '<div class="' + cfg.body + '">' + bodyInner + '</div></div>';
    }

    function renderDebug(step, planId, tgId) {
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="jms-aux-card jms-aux-card--debug jms-catalog-plan-native' + disabled + '" data-catalog-native="1" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">?</span>' +
            '<div class="jms-aux-card__content">' +
            '<span class="jms-aux-type">Debug</span>' +
            '<span class="jms-aux-name">' + esc(step.name || 'Debug Sampler') + '</span>' +
            '</div>' +
            renderCatalogActions(planId, tgId, step.id) +
            '</div>';
    }

    function renderLeaf(step, planId, tgId) {
        var badge = esc((step.category || 'cat').slice(0, 3).toUpperCase());
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="jms-catalog-plan-card jms-catalog-plan-native' + disabled + '" data-catalog-native="1" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<div class="jms-catalog-plan-card__head">' +
            '<span class="jms-catalog-plan-badge">' + badge + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            renderCatalogActions(planId, tgId, step.id) +
            '</div></div>';
    }

    function renderPlanCard(step, planId, tgId, renderChild) {
        if (!step || step.type !== 'catalog_element') return '';
        if (step.alias === 'DebugSampler') return renderDebug(step, planId, tgId);
        var cfg = step.alias && CTRL[step.alias];
        if (cfg && step.container) return renderController(step, planId, tgId, cfg, renderChild);
        if (global.JmsTgCatalogElementPlan && typeof global.JmsTgCatalogElementPlan.renderPlanCard === 'function') {
            return global.JmsTgCatalogElementPlan.renderPlanCard(step, planId, tgId, renderChild);
        }
        return renderLeaf(step, planId, tgId);
    }

    global.JmsTgCatalogElementPlanV2 = { renderPlanCard: renderPlanCard };
})(window);

/* ---- js/jms_jmeter_steps_scroll_chain_v1.js ---- */
/**
 * JMeter 压测 · 步骤区滚轮链式传递至页面（隔离模块）
 * 场景2：步骤区滚到顶/底后继续滚轮时，将剩余滚动传递给 window。
 */
(function (global) {
    'use strict';

    var STEPS_SEL = '.jms-tg-tree-steps';
    var MENU_SKIP_SEL = '#jms-v2-catalog-popup, .jms-if-mount-ctx-menu, .lth-step-menu, .jms-step-modal, .jms-modal-open,' +
        ' .jms-tg-sampler-menu, .jms-tg-post-proc-menu, .jms-tg-logic-ctrl-menu, .jms-tg-assert-menu, .jms-tg-listener-menu,' +
        ' .jms-http-ctx-proc-menu, .jms-http-ctx-preproc-menu, .jms-http-ctx-timer-menu, .jms-http-ctx-config-menu,' +
        ' .jms-http-ctx-assert-menu, .jms-http-ctx-listener-menu, .jms-http-ctx-logic-menu';

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isScrollableEl(el) {
        if (!el) return false;
        var style = global.getComputedStyle(el);
        var oy = style.overflowY;
        if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
        return el.scrollHeight > el.clientHeight + 1;
    }

    function canScrollEl(el, deltaY) {
        if (!isScrollableEl(el)) return false;
        if (deltaY < 0) return el.scrollTop > 0;
        if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        return false;
    }

    function canScrollWindow(deltaY) {
        var doc = global.document.documentElement;
        if (deltaY > 0) return global.window.scrollY + global.innerHeight < doc.scrollHeight - 1;
        if (deltaY < 0) return global.window.scrollY > 0;
        return false;
    }

    function onWheel(ev) {
        if (!isJmeterTab()) return;
        if (!ev.target || !ev.target.closest) return;
        if (ev.target.closest(MENU_SKIP_SEL)) return;
        if (global.JmsJmeterDropdownScrollGuard &&
            typeof global.JmsJmeterDropdownScrollGuard.hasOpenDropdownMenu === 'function' &&
            global.JmsJmeterDropdownScrollGuard.hasOpenDropdownMenu()) {
            return;
        }

        var stepsEl = ev.target.closest(STEPS_SEL);
        if (!stepsEl) return;

        var deltaY = ev.deltaY;
        if (!deltaY) return;

        if (canScrollEl(stepsEl, deltaY)) return;

        if (!canScrollWindow(deltaY)) return;

        ev.preventDefault();
        global.window.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
    }

    function init() {
        if (global.__jmsJmeterStepsScrollChainBound) return;
        global.__jmsJmeterStepsScrollChainBound = true;
        global.document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(typeof window !== 'undefined' ? window : this));
