/**
 * JDBC PostProcessor · JMX 导入/导出（隔离模块，仅 TG 级 jdbc_post）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function genJdbcPostProcessorXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'jdbc_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var xml = indent + '<JDBCPostProcessor guiclass="TestBeanGUI" testclass="JDBCPostProcessor" testname="' +
            escapeXml(proc.name || 'JDBC PostProcessor') + '" enabled="' + en + '">\n';
        if (proc.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(proc.comments) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="dataSource">' + escapeXml(proc.data_source || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryType">' + escapeXml(proc.query_type || 'Select Statement') + '</stringProp>\n';
        xml += indent + '  <stringProp name="query">' + escapeXml(proc.query || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryArguments">' + escapeXml(proc.query_arguments || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryArgumentsTypes">' + escapeXml(proc.query_arguments_types || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="variableNames">' + escapeXml(proc.variable_names || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultVariable">' + escapeXml(proc.result_variable || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryTimeout">' +
            escapeXml(proc.query_timeout !== undefined ? String(proc.query_timeout) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultSetMaxRows">' +
            escapeXml(proc.result_set_max_rows !== undefined ? String(proc.result_set_max_rows) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultSetHandler">' +
            escapeXml(proc.result_set_handler || 'Store as String') + '</stringProp>\n';
        xml += indent + '</JDBCPostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        return {
            type: 'jdbc_post',
            name: node.getAttribute('testname') || 'JDBC PostProcessor',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            data_source: getStringProp(node, 'dataSource') || '',
            query_type: getStringProp(node, 'queryType') || 'Select Statement',
            query: getStringProp(node, 'query') || '',
            query_arguments: getStringProp(node, 'queryArguments') || '',
            query_arguments_types: getStringProp(node, 'queryArgumentsTypes') || '',
            variable_names: getStringProp(node, 'variableNames') || '',
            result_variable: getStringProp(node, 'resultVariable') || '',
            query_timeout: getStringProp(node, 'queryTimeout') || '',
            result_set_max_rows: getStringProp(node, 'resultSetMaxRows') || '',
            result_set_handler: getStringProp(node, 'resultSetHandler') || 'Store as String'
        };
    }

    global.JmxJdbcPostProcessor = {
        genXml: genJdbcPostProcessorXml,
        parseElement: parseElement
    };
    function patchSamplerChildrenForJdbc() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._jdbcProcSamplerPatch) return;
        var prevGen = adv.genSamplerChildrenAdvanced;
        if (typeof prevGen !== 'function') return;
        adv._jdbcProcSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var jdbcProcs = (st.processors || []).filter(function (p) {
                return p && p.type === 'jdbc_post';
            });
            var otherProcs = (st.processors || []).filter(function (p) {
                return !p || p.type !== 'jdbc_post';
            });
            var stOther = Object.assign({}, st, { processors: otherProcs });
            var xml = prevGen.call(adv, stOther, childPad, helpers);
            jdbcProcs.forEach(function (proc) {
                if (global.JmxJdbcPostProcessor && typeof global.JmxJdbcPostProcessor.genXml === 'function') {
                    xml += global.JmxJdbcPostProcessor.genXml(proc, childPad, escapeXml);
                }
            });
            return xml;
        };
    }

    function bootJdbcSamplerPatch() {
        patchSamplerChildrenForJdbc();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bootJdbcSamplerPatch);
    } else {
        bootJdbcSamplerPatch();
    }

}(typeof window !== 'undefined' ? window : this));
