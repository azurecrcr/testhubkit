/**
 * 线程组级 ResultCollector（察看结果树/聚合报告）· JMX 导入（隔离模块）
 */
(function (global) {
    'use strict';

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function ensureListeners(tg) {
        if (!tg.listeners) {
            tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
        }
        return tg.listeners;
    }

    function applyResultCollector(node, tg) {
        if (!node || (node.getAttribute('testclass') || '') !== 'ResultCollector') return false;
        if (!isEnabled(node)) return true;
        var gui = node.getAttribute('guiclass') || '';
        var ls = ensureListeners(tg);
        if (gui === 'ViewResultsFullVisualizer') {
            ls.view_results_tree = true;
            if (global.JmsTgViewResultsTreeJmx && typeof global.JmsTgViewResultsTreeJmx.parseFromJmxNode === 'function') {
                tg.view_results_tree = global.JmsTgViewResultsTreeJmx.parseFromJmxNode(node);
            }
        }
        if (gui === 'StatVisualizer') {
            ls.aggregate_report = true;
            if (global.JmsTgAggregateReportJmx && typeof global.JmsTgAggregateReportJmx.parseFromJmxNode === 'function') {
                tg.aggregate_report = global.JmsTgAggregateReportJmx.parseFromJmxNode(node);
            }
        }
        return true;
    }

    global.JmsTgListenerImportJmx = {
        applyResultCollector: applyResultCollector
    };
}(typeof window !== 'undefined' ? window : this));
