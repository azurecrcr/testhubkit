/**
 * Backend Listener · JMX 解析/导出（隔离模块，TG / HTTP 步骤共用）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsBackendListenerCatalog;

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function parseParametersEl(el) {
        var params = [];
        if (!el) return params;
        var coll = el.querySelector('collectionProp[name="Arguments.arguments"]');
        if (!coll) return params;
        var props = coll.querySelectorAll('elementProp[elementType="Argument"]');
        for (var i = 0; i < props.length; i++) {
            var k = getStringProp(props[i], 'Argument.name');
            var v = getStringProp(props[i], 'Argument.value');
            if (k) params.push({ key: k, value: v });
        }
        return params;
    }

    function parseBackendListenerEl(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'BackendListener') return null;
        var argsEl = node.querySelector('elementProp[name="arguments"]');
        var cfg = {
            name: (node.getAttribute('testname') || '').trim(),
            comments: getStringProp(node, 'TestPlan.comments'),
            classname: getStringProp(node, 'classname'),
            queue_size: getStringProp(node, 'queueSize') || getStringProp(node, 'AsyncQueue.size') || '5000',
            parameters: parseParametersEl(argsEl),
            enabled: node.getAttribute('enabled') !== 'false'
        };
        return Catalog ? Catalog.normalizeConfig(cfg) : cfg;
    }

    function defaultEscapeXml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function genBackendListenerXml(cfg, indent, escapeXml) {
        if (!cfg) return '';
        if (Catalog) cfg = Catalog.normalizeConfig(cfg);
        escapeXml = escapeXml || defaultEscapeXml;
        var pad = indent || '';
        var pad2 = pad + '  ';
        var pad3 = pad2 + '  ';
        var pad4 = pad3 + '  ';
        var name = escapeXml(cfg.name || 'InfluxDB Backend Listener');
        var enabled = cfg.enabled === false ? 'false' : 'true';
        var xml = pad + '<BackendListener guiclass="BackendListenerGui" testclass="BackendListener" testname="' + name + '" enabled="' + enabled + '">\n';
        xml += pad2 + '<elementProp name="arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="Arguments" enabled="true">\n';
        xml += pad3 + '<collectionProp name="Arguments.arguments">\n';
        (cfg.parameters || []).forEach(function (p) {
            if (!p || !String(p.key || '').trim()) return;
            var pk = escapeXml(String(p.key).trim());
            xml += pad4 + '<elementProp name="' + pk + '" elementType="Argument">\n';
            xml += pad4 + '  <stringProp name="Argument.name">' + pk + '</stringProp>\n';
            xml += pad4 + '  <stringProp name="Argument.value">' + escapeXml(p.value == null ? '' : String(p.value)) + '</stringProp>\n';
            xml += pad4 + '  <stringProp name="Argument.metadata">=</stringProp>\n';
            xml += pad4 + '</elementProp>\n';
        });
        xml += pad3 + '</collectionProp>\n';
        xml += pad2 + '</elementProp>\n';
        var cls = cfg.classname || (Catalog ? Catalog.defaultConfig().classname : '');
        xml += pad2 + '<stringProp name="classname">' + escapeXml(cls) + '</stringProp>\n';
        if (cfg.comments) xml += pad2 + '<stringProp name="TestPlan.comments">' + escapeXml(cfg.comments) + '</stringProp>\n';
        if (cfg.queue_size) xml += pad2 + '<stringProp name="queueSize">' + escapeXml(String(cfg.queue_size)) + '</stringProp>\n';
        xml += pad + '</BackendListener>\n';
        xml += pad + '<hashTree/>\n';
        return xml;
    }

    global.JmsBackendListenerJmx = {
        parseBackendListenerEl: parseBackendListenerEl,
        genBackendListenerXml: genBackendListenerXml
    };
}(typeof window !== 'undefined' ? window : this));
