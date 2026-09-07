/**
 * 线程组配置元件 · 计数器 · JMX 导出（隔离模块）
 */
(function (global) {
    'use strict';

    function genCounterXml(d, indent, escapeXml) {
        if (!d) return '';
        if (d.enabled === false) return '';
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
        xml += indent + '  <boolProp name="CounterConfig.per_user">' + (d.per_user !== false ? 'true' : 'false') + '</boolProp>\n';
        if (d.reset_each_iteration === true) {
            xml += indent + '  <boolProp name="CounterConfig.reset_on_tg_iteration">true</boolProp>\n';
        }
        xml += indent + '</CounterConfig>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsTgCounterJmx = {
        genCounterXml: genCounterXml
    };
}(typeof window !== 'undefined' ? window : this));
