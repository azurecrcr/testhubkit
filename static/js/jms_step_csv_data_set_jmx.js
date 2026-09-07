/**
 * HTTP 步骤配置元件 · CSV 数据文件设置 · JMX 导入/导出（隔离模块）
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
            filename: getStringProp(el, 'filename') || '',
            file_encoding: getStringProp(el, 'fileEncoding') || 'UTF-8',
            variable_names: getStringProp(el, 'variableNames') || '',
            ignore_first_line: getBoolProp(el, 'ignoreFirstLine', false),
            delimiter: getStringProp(el, 'delimiter') || ',',
            quoted_data: getBoolProp(el, 'quotedData', false),
            recycle: getBoolProp(el, 'recycle', true),
            stop_thread: getBoolProp(el, 'stopThread', false),
            share_mode: getStringProp(el, 'shareMode') || 'shareMode.all',
            file_content: ''
        };
    }

    function genCsvDataSetXml(d, indent, escapeXml) {
        if (!d || !d.enabled) return '';
        var filename = d.filename ? String(d.filename).trim() : '';
        if (!filename && !d.file_content) return '';
        if (!filename) filename = 'data/data.csv';
        var testname = (d.name && String(d.name).trim()) || 'CSV 数据文件设置';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="filename">' + escapeXml(filename) + '</stringProp>\n';
        xml += indent + '  <stringProp name="fileEncoding">' + escapeXml(d.file_encoding || 'UTF-8') + '</stringProp>\n';
        xml += indent + '  <stringProp name="variableNames">' + escapeXml(d.variable_names || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="ignoreFirstLine">' + (d.ignore_first_line ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <stringProp name="delimiter">' + escapeXml(d.delimiter !== undefined ? String(d.delimiter) : ',') + '</stringProp>\n';
        xml += indent + '  <boolProp name="quotedData">' + (d.quoted_data ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="recycle">' + (d.recycle !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="stopThread">' + (d.stop_thread ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <stringProp name="shareMode">' + escapeXml(d.share_mode || 'shareMode.all') + '</stringProp>\n';
        xml += indent + '</CSVDataSet>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsStepCsvDataSetJmx = {
        parseFromEl: parseFromEl,
        genCsvDataSetXml: genCsvDataSetXml
    };
}(typeof window !== 'undefined' ? window : this));
