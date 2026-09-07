/**
 * JMeter 扩展元件 JMX 片段生成（计数器、扩展断言、监听器、定时器、用户参数）
 * 供 api_scenario_studio_scripts.html 引用，与 JMeter 5.6 导出格式对齐。
 */
(function (global) {
    'use strict';

    function resultCollectorSaveConfig(indent) {
        var p = indent + '  ';
        return indent + '<objProp>\n' +
            p + '<name>saveConfig</name>\n' +
            p + '<value class="SampleSaveConfiguration">\n' +
            p + '  <time>true</time>\n' +
            p + '  <latency>true</latency>\n' +
            p + '  <timestamp>true</timestamp>\n' +
            p + '  <success>true</success>\n' +
            p + '  <label>true</label>\n' +
            p + '  <code>true</code>\n' +
            p + '  <message>true</message>\n' +
            p + '  <threadName>true</threadName>\n' +
            p + '  <dataType>true</dataType>\n' +
            p + '  <encoding>false</encoding>\n' +
            p + '  <assertions>true</assertions>\n' +
            p + '  <subresults>true</subresults>\n' +
            p + '  <responseData>false</responseData>\n' +
            p + '  <samplerData>false</samplerData>\n' +
            p + '  <xml>false</xml>\n' +
            p + '  <fieldNames>true</fieldNames>\n' +
            p + '  <responseHeaders>false</responseHeaders>\n' +
            p + '  <requestHeaders>false</requestHeaders>\n' +
            p + '  <responseDataOnError>false</responseDataOnError>\n' +
            p + '  <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>\n' +
            p + '  <assertionsResultsToSave>0</assertionsResultsToSave>\n' +
            p + '  <bytes>true</bytes>\n' +
            p + '  <sentBytes>true</sentBytes>\n' +
            p + '  <url>true</url>\n' +
            p + '  <threadCounts>true</threadCounts>\n' +
            p + '  <idleTime>true</idleTime>\n' +
            p + '  <connectTime>true</connectTime>\n' +
            p + '</value>\n' +
            indent + '</objProp>\n';
    }

    function genCounterXml(cfg, indent, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        var xml = indent + '<CounterConfig guiclass="CounterConfigGui" testclass="CounterConfig" testname="计数器" enabled="true">\n';
        xml += indent + '  <stringProp name="CounterConfig.start">' + escapeXml(cfg.start || '1') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.end">' + escapeXml(cfg.maximum || cfg.end || '999999') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.incr">' + escapeXml(cfg.increment || cfg.incr || '1') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.name">' + escapeXml(cfg.variable_name || cfg.name || 'counter') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.format">' + escapeXml(cfg.format || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="CounterConfig.per_user">' + (cfg.per_user !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</CounterConfig>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function sizeOperatorToInt(op) {
        var map = { eq: 1, ne: 2, gt: 3, lt: 4, ge: 5, le: 6, equals: 1, '!=': 2, '>': 3, '<': 4, '>=': 5, '<=': 6 };
        if (op === undefined || op === null || op === '') return 5;
        var k = String(op).trim().toLowerCase();
        return map[k] !== undefined ? map[k] : 5;
    }

    function genExtendedAssertionXml(assertion, samplerName, childPad, escapeXml) {
        var xml = '';
        var testName = escapeXml((assertion.type || 'assert') + ' ' + (assertion.value || '') + ' ' + samplerName);
        if (assertion.type === 'json') {
            xml += childPad + '<JSONPathAssertion guiclass="JSONPathAssertionGui" testclass="JSONPathAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="JSON_PATH">' + escapeXml(assertion.value || '') + '</stringProp>\n';
            xml += childPad + '  <stringProp name="EXPECTED_VALUE">' + escapeXml(assertion.expected || '') + '</stringProp>\n';
            xml += childPad + '  <boolProp name="JSONVALIDATION">' + (assertion.expected ? 'true' : 'false') + '</boolProp>\n';
            xml += childPad + '  <boolProp name="EXPECT_NULL">false</boolProp>\n';
            xml += childPad + '  <boolProp name="INVERT">false</boolProp>\n';
            xml += childPad + '  <boolProp name="ISREGEX">' + (assertion.is_regex ? 'true' : 'false') + '</boolProp>\n';
            xml += childPad + '</JSONPathAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        } else if (assertion.type === 'xml') {
            xml += childPad + '<XMLAssertion guiclass="XMLAssertionGui" testclass="XMLAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <boolProp name="XMLAssertion.negate">false</boolProp>\n';
            xml += childPad + '  <stringProp name="XMLAssertion.user_defined_namespaces"></stringProp>\n';
            xml += childPad + '  <stringProp name="XMLAssertion.xpath">' + escapeXml(assertion.value || '') + '</stringProp>\n';
            xml += childPad + '  <boolProp name="XMLAssertion.validate">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XMLAssertion.whitespace">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XMLAssertion.tidy">false</boolProp>\n';
            xml += childPad + '</XMLAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        } else if (assertion.type === 'xpath') {
            xml += childPad + '<XPathAssertion guiclass="XPathAssertionGui" testclass="XPathAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <boolProp name="XPath.negate">false</boolProp>\n';
            xml += childPad + '  <stringProp name="XPath.xpath">' + escapeXml(assertion.value || '') + '</stringProp>\n';
            xml += childPad + '  <boolProp name="XPath.validate">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.whitespace">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.tidy">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.document">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.jmeter_attribute">false</boolProp>\n';
            xml += childPad + '</XPathAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        } else if (assertion.type === 'size') {
            xml += childPad + '<SizeAssertion guiclass="SizeAssertionGui" testclass="SizeAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="SizeAssertion.size">' + escapeXml(assertion.value || '0') + '</stringProp>\n';
            xml += childPad + '  <intProp name="SizeAssertion.operator">' + sizeOperatorToInt(assertion.operator) + '</intProp>\n';
            xml += childPad + '  <stringProp name="SizeAssertion.test_field">SizeAssertion.response_network_size</stringProp>\n';
            xml += childPad + '</SizeAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        }
        return xml;
    }

    function genViewResultsTreeXml(indent, escapeXml, cfgOrName, exportCtx) {
        if (global.JmsPlanViewResultsTreeJmx && typeof global.JmsPlanViewResultsTreeJmx.genXml === 'function' &&
            exportCtx && exportCtx.tgId === 'plan') {
            var planCfg = (cfgOrName && typeof cfgOrName === 'object') ? cfgOrName : { name: cfgOrName || '查看结果树' };
            return global.JmsPlanViewResultsTreeJmx.genXml(planCfg, indent, escapeXml, exportCtx);
        }
        if (global.JmsTgViewResultsTreeJmx && typeof global.JmsTgViewResultsTreeJmx.genXml === 'function') {
            var cfg = (cfgOrName && typeof cfgOrName === 'object')
                ? cfgOrName
                : { name: cfgOrName || '查看结果树' };
            return global.JmsTgViewResultsTreeJmx.genXml(cfg, indent, escapeXml);
        }
        var name = escapeXml(typeof cfgOrName === 'string' ? cfgOrName : '查看结果树');
        var xml = indent + '<ResultCollector guiclass="ViewResultsFullVisualizer" testclass="ResultCollector" testname="' + name + '" enabled="true">\n';
        xml += indent + '  <boolProp name="ResultCollector.error_logging">false</boolProp>\n';
        xml += resultCollectorSaveConfig(indent + '  ');
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '</ResultCollector>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genAggregateReportXml(indent, escapeXml, cfgOrName, exportCtx) {
        if (global.JmsPlanAggregateReportJmx && typeof global.JmsPlanAggregateReportJmx.genXml === 'function' &&
            exportCtx && exportCtx.tgId === 'plan') {
            var planAggCfg = (cfgOrName && typeof cfgOrName === 'object') ? cfgOrName : { name: cfgOrName || '聚合报告' };
            return global.JmsPlanAggregateReportJmx.genXml(planAggCfg, indent, escapeXml, exportCtx);
        }
        if (global.JmsTgAggregateReportJmx && typeof global.JmsTgAggregateReportJmx.genXml === 'function') {
            var cfg = (cfgOrName && typeof cfgOrName === 'object')
                ? cfgOrName
                : { name: cfgOrName || '聚合报告' };
            return global.JmsTgAggregateReportJmx.genXml(cfg, indent, escapeXml);
        }
        var name = escapeXml(typeof cfgOrName === 'string' ? cfgOrName : '聚合报告');
        var xml = indent + '<ResultCollector guiclass="StatVisualizer" testclass="ResultCollector" testname="' + name + '" enabled="true">\n';
        xml += indent + '  <boolProp name="ResultCollector.error_logging">false</boolProp>\n';
        xml += resultCollectorSaveConfig(indent + '  ');
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '</ResultCollector>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genConstantTimerXml(cfg, indent, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        var delay = cfg.delay_ms !== undefined ? cfg.delay_ms : (cfg.delay !== undefined ? cfg.delay : 300);
        var name = (cfg.name && String(cfg.name).trim()) || '固定定时器';
        var comments = cfg.comments != null ? String(cfg.comments) : '';
        var enabled = cfg.enabled !== false ? 'true' : 'false';
        var xml = indent + '<ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="' + escapeXml(name) + '" enabled="' + enabled + '">\n';
        if (comments) xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(comments) + '</stringProp>\n';
        xml += indent + '  <stringProp name="ConstantTimer.delay">' + escapeXml(String(delay)) + '</stringProp>\n';
        xml += indent + '</ConstantTimer>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genUserParametersXml(cfg, indent, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        var Catalog = global.JmsHttpStepUserParamsCatalog;
        var norm = Catalog && typeof Catalog.normalizeParams === 'function' ? Catalog.normalizeParams(cfg) : cfg;
        if (!norm || !norm.enabled) return '';
        var params = (norm.params || []).filter(function (p) { return p && String(p.key || '').trim(); });
        if (!params.length) return '';
        var testname = escapeXml(norm.name || '用户参数');
        var xml = indent + '<UserParameters guiclass="UserParametersGui" testclass="UserParameters" testname="' + testname + '" enabled="true">\n';
        if (norm.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(norm.comments) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="UserParameters.names">\n';
        params.forEach(function (p, i) {
            xml += indent + '    <stringProp name="' + i + '">' + escapeXml(String(p.key).trim()) + '</stringProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        var userCount = norm.user_count || 1;
        xml += indent + '  <collectionProp name="UserParameters.thread_values">\n';
        for (var u = 0; u < userCount; u++) {
            xml += indent + '    <collectionProp name="' + u + '">\n';
            params.forEach(function (p, i) {
                var val = (p.values && p.values[u] !== undefined) ? p.values[u] : '';
                xml += indent + '      <stringProp name="' + i + '">' + escapeXml(String(val)) + '</stringProp>\n';
            });
            xml += indent + '    </collectionProp>\n';
        }
        xml += indent + '  </collectionProp>\n';
        xml += indent + '  <boolProp name="UserParameters.per_iteration">' + (norm.per_iteration ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</UserParameters>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genStepChildComponentsXml(st, childPad, escapeXml) {
        var xml = '';
        if (global.JmsHttpStepListenerJmx && typeof global.JmsHttpStepListenerJmx.genStepListenersXml === 'function') {
            xml += global.JmsHttpStepListenerJmx.genStepListenersXml(st, childPad, escapeXml);
        }
        var sl = st.step_listeners || {};
        var hasItems = global.JmsHttpStepListenerCatalog &&
            Array.isArray(st.step_listener_items) &&
            st.step_listener_items.length;
        if (!hasItems) {
            if (sl.view_results_tree) {
                xml += genViewResultsTreeXml(childPad, escapeXml, { name: '查看结果树 ' + (st.name || '') });
            }
            if (sl.aggregate_report) {
                xml += genAggregateReportXml(childPad, escapeXml, { name: '聚合报告 ' + (st.name || '') });
            }
        }
        if (st.constant_timer) {
            xml += genConstantTimerXml(st.constant_timer, childPad, escapeXml);
        }
        if (Array.isArray(st.pre_processors) && global.JmsHttpBeanshellPreProcessorJmx &&
            typeof global.JmsHttpBeanshellPreProcessorJmx.genXml === 'function') {
            st.pre_processors.forEach(function (p) {
                if (p && p.type === 'beanshell_pre') {
                    xml += global.JmsHttpBeanshellPreProcessorJmx.genXml(p, childPad, escapeXml);
                }
            });
        }
        if (st.user_parameters) {
            xml += genUserParametersXml(st.user_parameters, childPad, escapeXml);
        }
        if (global.JmsHttpStepConfigJmx &&
            typeof global.JmsHttpStepConfigJmx.genStepConfigXml === 'function') {
            xml += global.JmsHttpStepConfigJmx.genStepConfigXml(st, childPad, escapeXml);
        }
        return xml;
    }

    function genTgListenersXml(listeners, indent, escapeXml, tgName, vrtConfig, aggConfig, exportCtx) {
        var xml = '';
        var ls = listeners || {};
        if (ls.view_results_tree) {
            var cfg = vrtConfig && typeof vrtConfig === 'object'
                ? Object.assign({ name: vrtConfig.name || ('查看结果树 · ' + (tgName || '')) }, vrtConfig)
                : { name: '查看结果树 · ' + (tgName || '') };
            xml += genViewResultsTreeXml(indent, escapeXml, cfg, exportCtx);
        }
        if (ls.aggregate_report) {
            var aggCfg = aggConfig && typeof aggConfig === 'object'
                ? Object.assign({ name: aggConfig.name || ('聚合报告 · ' + (tgName || '')) }, aggConfig)
                : { name: '聚合报告 · ' + (tgName || '') };
            xml += genAggregateReportXml(indent, escapeXml, aggCfg, exportCtx);
        }
        return xml;
    }

    global.JmeterJmxExtra = {
        genCounterXml: genCounterXml,
        genExtendedAssertionXml: genExtendedAssertionXml,
        genViewResultsTreeXml: genViewResultsTreeXml,
        genAggregateReportXml: genAggregateReportXml,
        genConstantTimerXml: genConstantTimerXml,
        genUserParametersXml: genUserParametersXml,
        genStepChildComponentsXml: genStepChildComponentsXml,
        genTgListenersXml: genTgListenersXml
    };
})(window);
