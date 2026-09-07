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
