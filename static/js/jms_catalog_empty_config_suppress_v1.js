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
