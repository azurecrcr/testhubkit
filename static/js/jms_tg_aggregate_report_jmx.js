/**
 * 线程组 · 聚合报告 JMX 片段（隔离模块）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsTgAggregateReportCatalog;
    var RcActions = global.JmsTgResultCollectorActions;

    function saveConfigXml(indent, cfg) {
        if (RcActions && typeof RcActions.saveConfigXml === 'function') {
            return RcActions.saveConfigXml(indent, cfg);
        }
        return '';
    }

    function genXml(cfg, indent, escapeXml) {
        cfg = Catalog ? Catalog.normalizeConfig(cfg) : (cfg || {});
        var esc = escapeXml || function (s) { return String(s == null ? '' : s); };
        var name = esc(cfg.name || '聚合报告');
        var enabled = cfg.enabled !== false ? 'true' : 'false';
        var errorLogging = cfg.log_errors_only ? 'true' : 'false';
        var filename = esc(cfg.filename || '');
        var comments = esc(cfg.comments || '');
        var xml = indent + '<ResultCollector guiclass="StatVisualizer" testclass="ResultCollector" testname="' + name + '" enabled="' + enabled + '">\n';
        if (comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + comments + '</stringProp>\n';
        }
        xml += indent + '  <boolProp name="ResultCollector.error_logging">' + errorLogging + '</boolProp>\n';
        if (cfg.log_success_only) {
            xml += indent + '  <boolProp name="ResultCollector.success_only_logging">true</boolProp>\n';
        }
        xml += saveConfigXml(indent + '  ', cfg.save_config);
        xml += indent + '  <stringProp name="filename">' + filename + '</stringProp>\n';
        xml += indent + '</ResultCollector>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function readBoolProp(node, propName) {
        if (!node) return false;
        var el = node.querySelector('boolProp[name="' + propName + '"]');
        return el ? el.textContent === 'true' : false;
    }

    function readStringProp(node, propName) {
        if (!node) return '';
        var el = node.querySelector('stringProp[name="' + propName + '"]');
        return el ? (el.textContent || '') : '';
    }

    function parseFromJmxNode(node) {
        if (!node || !Catalog) return null;
        var gui = node.getAttribute('guiclass') || '';
        if (gui !== 'StatVisualizer') return null;
        return Catalog.normalizeConfig({
            name: node.getAttribute('testname') || '聚合报告',
            comments: readStringProp(node, 'TestPlan.comments'),
            filename: readStringProp(node, 'filename'),
            log_errors_only: readBoolProp(node, 'ResultCollector.error_logging'),
            log_success_only: readBoolProp(node, 'ResultCollector.success_only_logging'),
            enabled: node.getAttribute('enabled') !== 'false',
            save_config: RcActions ? RcActions.parseSaveConfigFromJmxNode(node) : undefined
        });
    }

    global.JmsTgAggregateReportJmx = {
        genXml: genXml,
        parseFromJmxNode: parseFromJmxNode
    };
}(typeof window !== 'undefined' ? window : this));
