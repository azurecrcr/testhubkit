/**
 * catalog 定时器/处理器/取样器/监听器 · catalog_props JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s);
    }

    function escapeFn(helpers) {
        return function (s) { return esc(s, helpers); };
    }

    function legacy(step) {
        var P = global.JmsCatalogJmxPrepare;
        return P && typeof P.legacyItemFromCatalog === 'function' ? P.legacyItemFromCatalog(step) : (step.catalog_props || {});
    }

    function genConstantTimer(step, indent, helpers) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genConstantTimerXml !== 'function') return '';
        var item = legacy(step);
        var cfg = {
            enabled: step.enabled !== false,
            name: step.name || item.name || '固定定时器',
            comments: item.comments || '',
            delay_ms: item.delay_ms !== undefined ? item.delay_ms : (item.delay !== undefined ? item.delay : 300)
        };
        return E.genConstantTimerXml(cfg, indent, escapeFn(helpers));
    }

    function genDebugSampler(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<DebugSampler guiclass="TestBeanGUI" testclass="DebugSampler" testname="' +
            e(item.name || 'Debug Sampler', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <boolProp name="displayJMeterProperties">' + (item.display_jmeter_properties ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displayJMeterVariables">' + (item.display_jmeter_variables !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displaySystemProperties">' + (item.display_system_properties ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</DebugSampler>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genRegexExtractor(step, indent, helpers) {
        var item = legacy(step);
        var J = global.JmxRegexExtractor;
        if (J && typeof J.genRegexExtractorXml === 'function') {
            return J.genRegexExtractorXml(Object.assign({ type: 'regex_extract' }, item), indent, escapeFn(helpers));
        }
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="' +
            e(item.name || ('正则表达式提取器 ' + (item.refname || '')), helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="RegexExtractor.refname">' + e(item.refname || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.regex">' + e(item.regex || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.template">' + e(item.template != null ? String(item.template) : '$1$', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.default">' + e(item.default_value != null ? String(item.default_value) : '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.match_number">' + e(item.match_number != null ? String(item.match_number) : '1', helpers) + '</stringProp>\n';
        xml += indent + '</RegexExtractor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genJsonPostProcessor(step, indent, helpers) {
        var item = legacy(step);
        var J = global.JmxJsonPostProcessor;
        if (J && typeof J.genJsonPostProcessorXml === 'function') {
            var proc = Object.assign({ type: 'json_post' }, item);
            if (!proc.var && item.referenceNames) proc.var = item.referenceNames;
            if (!proc.json_path && item.jsonPathExprs) proc.json_path = item.jsonPathExprs;
            return J.genJsonPostProcessorXml(proc, indent, escapeFn(helpers));
        }
        return '';
    }

    function genBeanShellPost(step, indent, helpers) {
        var item = legacy(step);
        var B = global.JmsTgBeanshellPostJmx;
        if (B && typeof B.genXml === 'function') {
            return B.genXml(Object.assign({ type: 'beanshell_post' }, item), indent, escapeFn(helpers));
        }
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPostProcessor guiclass="TestBeanGUI" testclass="BeanShellPostProcessor" testname="' +
            e(item.name || 'BeanShell PostProcessor', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">false</boolProp>\n';
        xml += indent + '  <stringProp name="script">' + e(item.script || '', helpers) + '</stringProp>\n';
        xml += indent + '</BeanShellPostProcessor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genBeanShellPre(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPreProcessor guiclass="TestBeanGUI" testclass="BeanShellPreProcessor" testname="' +
            e(item.name || 'BeanShell PreProcessor', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">false</boolProp>\n';
        xml += indent + '  <stringProp name="script">' + e(item.script || '', helpers) + '</stringProp>\n';
        xml += indent + '</BeanShellPreProcessor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genXPathExtractor(step, indent, helpers) {
        var item = legacy(step);
        var X = global.JmxXPathExtractor;
        if (X && typeof X.genXPathExtractorXml === 'function') {
            return X.genXPathExtractorXml(Object.assign({ type: 'xpath_extract' }, item), indent, escapeFn(helpers));
        }
        return '';
    }

    function genJsR223Post(step, indent, helpers) {
        var item = legacy(step);
        var J = global.JmxJsr223PostProcessor;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(Object.assign({ type: 'jsr223_post' }, item), indent, escapeFn(helpers));
        }
        return '';
    }

    function genBackendListener(step, indent, helpers) {
        var P = global.JmsPlanCatalogJmxProps;
        if (P && typeof P.genBackendListenerFromCatalog === 'function') {
            return P.genBackendListenerFromCatalog(step, indent);
        }
        return '';
    }

    function genViewResults(step, indent, helpers) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genViewResultsTreeXml !== 'function') return '';
        return E.genViewResultsTreeXml(indent, escapeFn(helpers), step.name || '查看结果树', {});
    }

    function genAggregate(step, indent, helpers) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genAggregateReportXml !== 'function') return '';
        return E.genAggregateReportXml(indent, escapeFn(helpers), step.name || '聚合报告', {});
    }

    function genUserParameters(step, indent, helpers) {
        var item = legacy(step);
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genUserParametersXml !== 'function') return '';
        return E.genUserParametersXml({
            enabled: step.enabled !== false,
            name: step.name || item.name || '用户参数',
            per_iteration: item.per_iteration,
            params: item.params || []
        }, indent, escapeFn(helpers));
    }

    function genResponseAssertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'response_assert';
        var J = global.JmsHttpResponseAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }

    function genJsonAssertion(step, indent, helpers) {
        var item = legacy(step);
        var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA && typeof JA.toLegacyProps === 'function') {
            item = Object.assign({}, item, JA.toLegacyProps(item));
        }
        item.type = item.type || 'json_assert';
        var J = global.JmsHttpJsonAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }

    function genSizeAssertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'size_assert';
        var J = global.JmsHttpSizeAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }

    function genMd5HexAssertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'md5hex_assert';
        var D = global.JmsAssertionExportIncludeDisabledV1;
        if (D && typeof D.genAssertionXml === 'function') {
            return D.genAssertionXml(item, step.name || '', indent, escapeFn(helpers));
        }
        var J = global.JmsHttpMd5hexAssertionJmx;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, indent, escapeFn(helpers));
        }
        return '';
    }


    function genJsR223Assertion(step, indent, helpers) {
        var item = legacy(step);
        item.type = item.type || 'jsr223_assert';
        var J = global.JmxJsr223Assertion;
        if (J && typeof J.genXml === 'function') {
            return J.genXml(item, step.name || '', indent, escapeFn(helpers));
        }
        return '';
    }

    function genJdbcPost(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var en = step.enabled === false ? 'false' : 'true';
        var dataSource = item.dataSource || item.data_source || '';
        var variableNames = item.variableNames || item.variable_names || '';
        var resultVariable = item.resultVariable || item.result_variable || '';
        var queryTypes = item.queryTypes || item.query_types || item.query_type || '';
        var xml = indent + '<JDBCPostProcessor guiclass="TestBeanGUI" testclass="JDBCPostProcessor" testname="' +
            e(item.name || 'JDBC PostProcessor', helpers) + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="dataSource">' + e(dataSource, helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="query">' + e(item.query || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryArguments">' + e(item.queryArguments || item.query_arguments || '', helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryTypes">' + e(queryTypes, helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="variableNames">' + e(variableNames, helpers) + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultVariable">' + e(resultVariable, helpers) + '</stringProp>\n';
        xml += indent + '</JDBCPostProcessor>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    var MAP = {
        ConstantTimer: genConstantTimer,
        DebugSampler: genDebugSampler,
        RegexExtractor: genRegexExtractor,
        JSONPostProcessor: genJsonPostProcessor,
        BeanShellPostProcessor: genBeanShellPost,
        BeanShellPreProcessor: genBeanShellPre,
        XPathExtractor: genXPathExtractor,
        JSR223PostProcessor: genJsR223Post,
        BackendListener: genBackendListener,
        ViewResultsFullVisualizer: genViewResults,
        StatVisualizer: genAggregate,
        ResultCollector: genAggregate,
        UserParameters: genUserParameters,
        ResponseAssertion: genResponseAssertion,
        JSONPathAssertion: genJsonAssertion,
        SizeAssertion: genSizeAssertion,
        JDBCPostProcessor: genJdbcPost,
        MD5HexAssertion: genMd5HexAssertion,
        JSR223Assertion: genJsR223Assertion
    };

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element') return '';
        var fn = MAP[step.alias];
        if (!fn) return '';
        return fn(step, indent, helpers);
    }

    global.JmsCatalogAuxJmx = {
        genXml: genXml,
        MAP: MAP
    };
})(typeof window !== 'undefined' ? window : this);
