/**
 * JMX 导出 V2 · HTTP 取样器子组件单通道写出（跳过重复 genStepConfigXml）
 */
(function (global) {
    'use strict';

    function genStepChildComponentsXml(st, childPad, escapeXml) {
        var xml = '';
        var E = global.JmeterJmxExtra;
        if (!E) return xml;

        if (global.JmsHttpStepListenerJmx && typeof global.JmsHttpStepListenerJmx.genStepListenersXml === 'function') {
            xml += global.JmsHttpStepListenerJmx.genStepListenersXml(st, childPad, escapeXml);
        }
        var sl = st.step_listeners || {};
        var hasItems = global.JmsHttpStepListenerCatalog &&
            Array.isArray(st.step_listener_items) &&
            st.step_listener_items.length;
        if (!hasItems) {
            if (sl.view_results_tree && typeof E.genViewResultsTreeXml === 'function') {
                xml += E.genViewResultsTreeXml(childPad, escapeXml, { name: '查看结果树 ' + (st.name || '') });
            }
            if (sl.aggregate_report && typeof E.genAggregateReportXml === 'function') {
                xml += E.genAggregateReportXml(childPad, escapeXml, { name: '聚合报告 ' + (st.name || '') });
            }
        }
        if (st.constant_timer && typeof E.genConstantTimerXml === 'function') {
            xml += E.genConstantTimerXml(st.constant_timer, childPad, escapeXml);
        }
        if (Array.isArray(st.pre_processors) && global.JmsHttpBeanshellPreProcessorJmx &&
            typeof global.JmsHttpBeanshellPreProcessorJmx.genXml === 'function') {
            st.pre_processors.forEach(function (p) {
                if (p && p.type === 'beanshell_pre') {
                    xml += global.JmsHttpBeanshellPreProcessorJmx.genXml(p, childPad, escapeXml);
                }
            });
        }
        if (st.user_parameters && typeof E.genUserParametersXml === 'function') {
            var UP = global.JmsCatalogUserParametersExportV1;
            if (UP && typeof UP.genUserParametersXml === 'function') {
                xml += UP.genUserParametersXml(st.user_parameters, childPad, escapeXml);
            } else {
                xml += E.genUserParametersXml(st.user_parameters, childPad, escapeXml);
            }
        }
        return xml;
    }

    global.JmeterJmxExtraExportV2 = {
        genStepChildComponentsXml: genStepChildComponentsXml
    };
})(typeof window !== 'undefined' ? window : this);
