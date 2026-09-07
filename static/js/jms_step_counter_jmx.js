/**
 * HTTP 步骤配置元件 · 计数器 · JMX 导入/导出（隔离模块）
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
            start: getStringProp(el, 'CounterConfig.start') || '',
            increment: getStringProp(el, 'CounterConfig.incr') || '',
            maximum: getStringProp(el, 'CounterConfig.end') || '',
            format: getStringProp(el, 'CounterConfig.format') || '',
            variable_name: getStringProp(el, 'CounterConfig.name') || '',
            per_user: getBoolProp(el, 'CounterConfig.per_user', false),
            reset_each_iteration: getBoolProp(el, 'CounterConfig.reset_on_tg_iteration', false)
        };
    }

    function genCounterXml(d, indent, escapeXml) {
        if (!d || !d.enabled) return '';
        var testname = (d.name && String(d.name).trim()) || '计数器';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CounterConfig guiclass="CounterConfigGui" testclass="CounterConfig" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="CounterConfig.start">' + escapeXml(d.start || '1') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.end">' + escapeXml(d.maximum || d.end || '999999') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.incr">' + escapeXml(d.increment || d.incr || '1') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.name">' + escapeXml(d.variable_name || 'counter') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.format">' + escapeXml(d.format || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="CounterConfig.per_user">' + (d.per_user === true ? 'true' : 'false') + '</boolProp>\n';
        if (d.reset_each_iteration === true) {
            xml += indent + '  <boolProp name="CounterConfig.reset_on_tg_iteration">true</boolProp>\n';
        }
        xml += indent + '</CounterConfig>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsStepCounterJmx = {
        parseFromEl: parseFromEl,
        genCounterXml: genCounterXml
    };
}(typeof window !== 'undefined' ? window : this));
