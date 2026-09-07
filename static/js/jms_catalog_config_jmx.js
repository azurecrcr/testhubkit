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
