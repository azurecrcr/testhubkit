/**
 * plan catalog 元件 · catalog_props → JMX（HeaderManager / Arguments）
 */
(function (global) {
    'use strict';

    function esc(s) {
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function kvRows(props, keys) {
        keys = keys || ['headers', 'arguments', 'variables'];
        for (var i = 0; i < keys.length; i += 1) {
            if (props && Array.isArray(props[keys[i]]) && props[keys[i]].length) return props[keys[i]];
        }
        return [];
    }

    function genHeaderManagerXml(step, indent) {
        var props = step.catalog_props || {};
        var rows = kvRows(props, ['headers']);
        var testname = esc(step.name || step.label_zh || 'HTTP 信息头管理器');
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="' + testname + '" enabled="' + en + '">\n';
        if (props.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + esc(props.comments) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="HeaderManager.headers">\n';
        rows.forEach(function (row) {
            var name = esc((row && (row.name || row.key)) || '');
            if (!name) return;
            xml += indent + '    <elementProp name="' + name + '" elementType="Header">\n';
            xml += indent + '      <stringProp name="Header.name">' + name + '</stringProp>\n';
            xml += indent + '      <stringProp name="Header.value">' + esc(row.value == null ? '' : row.value) + '</stringProp>\n';
            xml += indent + '    </elementProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        xml += indent + '</HeaderManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genArgumentsXml(step, indent) {
        var props = step.catalog_props || {};
        var rows = kvRows(props, ['arguments', 'variables']);
        var testname = esc(step.name || step.label_zh || '用户定义的变量');
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="' + testname + '" enabled="' + en + '">\n';
        if (props.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + esc(props.comments) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="Arguments.arguments">\n';
        rows.forEach(function (row) {
            var name = esc((row && (row.name || row.key)) || '');
            if (!name) return;
            xml += indent + '    <elementProp name="' + name + '" elementType="Argument">\n';
            xml += indent + '      <stringProp name="Argument.name">' + name + '</stringProp>\n';
            xml += indent + '      <stringProp name="Argument.value">' + esc(row.value == null ? '' : row.value) + '</stringProp>\n';
            xml += indent + '      <stringProp name="Argument.metadata">=</stringProp>\n';
            xml += indent + '    </elementProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        xml += indent + '</Arguments>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function tryGenFromProps(step, indent) {
        if (!step || step.type !== 'catalog_element') return '';
        if (step.alias === 'HeaderManager') return genHeaderManagerXml(step, indent);
        if (step.alias === 'Arguments') return genArgumentsXml(step, indent);
        if (global.JmsPlanCatalogResolve && global.JmsPlanCatalogResolve.isHttpDefaultsItem(step)) {
            return genHttpDefaultsFromCatalog(step, indent);
        }
        if (global.JmsPlanCatalogResolve && global.JmsPlanCatalogResolve.isBackendListenerItem(step)) {
            return genBackendListenerFromCatalog(step, indent);
        }
        return '';
    }

    function genHttpDefaultsFromCatalog(step, indent) {
        var R = global.JmsPlanCatalogResolve;
        var hd = Object.assign(
            { enabled: step.enabled !== false, name: step.name || step.label_zh || 'HTTP 请求默认值' },
            (step.catalog_props || {})
        );
        if (R && typeof R.httpDefaultsToBaseUrl === 'function' && !sid(hd.domain).trim() && step.catalog_props && step.catalog_props.base_url) {
            hd = Object.assign(hd, R.baseUrlToHttpDefaultsProps(step.catalog_props.base_url));
        }
        if (global.JmsTgHttpDefaultsJmx && typeof global.JmsTgHttpDefaultsJmx.genHttpDefaultsXml === 'function') {
            return global.JmsTgHttpDefaultsJmx.genHttpDefaultsXml(hd, indent, esc);
        }
        return '';
    }

    function genBackendListenerFromCatalog(step, indent) {
        var cfg = null;
        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.backendConfigFromItem === 'function') {
            cfg = global.JmsPlanCatalogResolve.backendConfigFromItem(step);
        }
        if (!cfg) return '';
        if (global.JmsBackendListenerJmx && typeof global.JmsBackendListenerJmx.genBackendListenerXml === 'function') {
            return global.JmsBackendListenerJmx.genBackendListenerXml(cfg, indent, esc);
        }
        return '';
    }

    function sid(v) { return v == null ? '' : String(v); }

    global.JmsPlanCatalogJmxProps = {
        tryGenFromProps: tryGenFromProps,
        genHeaderManagerXml: genHeaderManagerXml,
        genArgumentsXml: genArgumentsXml,
        genHttpDefaultsFromCatalog: genHttpDefaultsFromCatalog,
        genBackendListenerFromCatalog: genBackendListenerFromCatalog
    };
})(typeof window !== 'undefined' ? window : this);
