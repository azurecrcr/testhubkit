/**
 * 线程组 CSV 数据文件设置 · JMX 导出（隔离模块）
 */
(function (global) {
    'use strict';

    function genCsvDataSetXml(d, indent, escapeXml) {
        if (!d) return '';
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

    global.JmsTgCsvDataSetJmx = {
        genCsvDataSetXml: genCsvDataSetXml
    };
}(typeof window !== 'undefined' ? window : this));
