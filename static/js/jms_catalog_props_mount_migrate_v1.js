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
