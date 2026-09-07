/**
 * JMX 导入 · 逻辑控制器内配置元件直接写入 children 时间线（隔离模块）
 */
(function (global) {
    'use strict';

    var TYPE_MAP = {
        http_defaults: { alias: 'ConfigTestElement', testclass: 'ConfigTestElement', guiclass: 'HttpDefaultsGui', category: 'config', label_zh: 'HTTP 请求默认值' },
        header_manager: { alias: 'HeaderManager', testclass: 'HeaderManager', guiclass: 'HeaderPanel', category: 'config', label_zh: 'HTTP 信息头管理器' },
        auth_manager: { alias: 'AuthManager', testclass: 'AuthManager', guiclass: 'AuthPanel', category: 'config', label_zh: 'HTTP 授权管理器' },
        cookie_manager: { alias: 'CookieManager', testclass: 'CookieManager', guiclass: 'CookiePanel', category: 'config', label_zh: 'HTTP Cookie 管理器' },
        cache_manager: { alias: 'CacheManager', testclass: 'CacheManager', guiclass: 'CachePanel', category: 'config', label_zh: 'HTTP 缓存管理器' },
        csv_data_set: { alias: 'CSVDataSet', testclass: 'CSVDataSet', guiclass: 'TestBeanGUI', category: 'config', label_zh: 'CSV 数据文件设置' },
        counter: { alias: 'CounterConfig', testclass: 'CounterConfig', guiclass: 'CounterConfigGui', category: 'config', label_zh: '计数器' }
    };

    function isEnabled(node) {
        return node.getAttribute('enabled') !== 'false';
    }

    function buildCatalogProps(node, gui, cfgType, P) {
        if (!P || typeof P.buildConfigItemFromNode !== 'function') return null;
        var raw = P.buildConfigItemFromNode(node, gui);
        if (!raw || !raw.data) return null;
        return Object.assign({}, raw.data);
    }

    function buildStep(node, gui, parserApi) {
        if (!node || !parserApi || typeof parserApi.configTypeFromNode !== 'function') return null;
        var cfgType = parserApi.configTypeFromNode(node, gui);
        if (!cfgType || !TYPE_MAP[cfgType]) return null;
        var map = TYPE_MAP[cfgType];
        var props = buildCatalogProps(node, gui, cfgType, parserApi);
        if (!props) props = { name: node.getAttribute('testname') || map.label_zh };
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && typeof HN.normalizeConfigCatalogProps === 'function') {
            props = HN.normalizeConfigCatalogProps(props, cfgType);
        }
        var name = (props.name || node.getAttribute('testname') || map.label_zh).trim();
        return {
            type: 'catalog_element',
            name: name,
            enabled: isEnabled(node),
            alias: map.alias,
            testclass: map.testclass,
            guiclass: map.guiclass,
            category: map.category,
            label_zh: map.label_zh,
            container: false,
            scope: 'unified',
            catalog_props: props,
            jmx_fragment: ''
        };
    }

    global.JmsJmxImportControllerConfigStepV1 = {
        buildStep: buildStep,
        TYPE_MAP: TYPE_MAP
    };
}(typeof window !== 'undefined' ? window : this));
