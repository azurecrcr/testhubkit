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
