/**
 * 线程组时间线 · JMX 导出过滤器扩展（隔离模块）
 * 允许 variables_timeline_ui 等模块包装 filterVariablesForExport 后仍被 prepare/export 链路调用。
 */
(function (global) {
    'use strict';

    function repatchProcessorXml() {
        var Adv = global.JmxScenarioAdvanced;
        var F = global.JmsTgJmxExportFilter;
        if (!Adv || !F || typeof Adv.__jmxExportFilterOrigGenProcessorsXml !== 'function') return;
        var orig = Adv.__jmxExportFilterOrigGenProcessorsXml;
        Adv.genProcessorsXml = function (list, indent, escapeXml) {
            var filtered = typeof F.filterProcessorsForExport === 'function'
                ? F.filterProcessorsForExport(list)
                : list;
            return orig.call(Adv, filtered, indent, escapeXml);
        };
        Adv.__jmxExportFilterPatched = true;
    }

    function bind() {
        repatchProcessorXml();
    }

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', bind);
        } else {
            bind();
        }
        global.addEventListener('load', bind);
    } else {
        bind();
    }

    global.JmsTgTimelineExportParity = { repatchProcessorXml: repatchProcessorXml };
}(typeof window !== 'undefined' ? window : this));
