/**
 * JMeter catalog_element · 各元件配置字段 schema（对齐 JMeter GUI 属性）
 */
(function (global) {
    'use strict';

    var LANG_OPTS = [
        { val: 'groovy', label: 'groovy' },
        { val: 'javascript', label: 'javascript' },
        { val: 'beanshell', label: 'beanshell' },
        { val: 'jython', label: 'jython' }
    ];

    var APPLY_TO_OPTS = [
        { val: 'main_only', label: 'Main sample only' },
        { val: 'main_and_sub', label: 'Main sample and sub-samples' },
        { val: 'sub_only', label: 'Sub-samples only' },
        { val: 'jmeter_variable', label: 'JMeter Variable' }
    ];

    var TEST_FIELD_OPTS = [
        { val: 'response_text', label: '响应文本' },
        { val: 'response_code', label: '响应代码' },
        { val: 'response_message', label: '响应信息' },
        { val: 'response_headers', label: 'Response Headers' },
        { val: 'request_headers', label: 'Request Headers' },
        { val: 'url_sample', label: 'URL样本' },
        { val: 'document', label: 'Document (text)' },
        { val: 'request_data', label: 'Request Data' }
    ];

    var MATCH_MODE_OPTS = [
        { val: 'contains', label: '包括' },
        { val: 'matches', label: '匹配' },
        { val: 'equals', label: 'Equals' },
        { val: 'substring', label: 'Substring' }
    ];

    var EXTRACT_APPLY_OPTS = [
        { val: 'main', label: 'Main sample only' },
        { val: 'sub', label: 'Sub-samples only' },
        { val: 'both', label: 'Main and sub-samples' },
        { val: 'variable', label: 'JMeter Variable Name to use' }
    ];

    var FIELD_CHECK = { val: 'body', label: 'Body' };
    var FIELD_CHECK_OPTS = [
        FIELD_CHECK,
        { val: 'url', label: 'URL' },
        { val: 'headers', label: 'Headers' },
        { val: 'unencoded', label: 'Body (unencoded)' }
    ];

    var ALIAS_SCHEMAS = {
        ConstantTimer: {
            fields: [{ key: 'delay_ms', type: 'number', label: '线程延迟 (毫秒)', default: 300, min: 0 }]
        },
        UniformRandomTimer: {
            fields: [
                { key: 'delay_ms', type: 'number', label: '固定延迟偏移 (毫秒)', default: 0, min: 0 },
                { key: 'random_delay_max', type: 'number', label: '随机延迟最大值 (毫秒)', default: 100, min: 0 }
            ]
        },
        GaussianRandomTimer: {
            fields: [
                { key: 'delay_ms', type: 'number', label: 'Constant Delay Offset (毫秒)', default: 300, min: 0 },
                { key: 'deviation', type: 'number', label: 'Deviation (毫秒)', default: 100, min: 0 }
            ]
        },
        PoissonRandomTimer: {
            fields: [
                { key: 'delay_ms', type: 'number', label: 'Constant Delay Offset (毫秒)', default: 300, min: 0 },
                { key: 'lambda', type: 'number', label: 'Lambda (毫秒)', default: 100, min: 0 }
            ]
        },
        SyncTimer: {
            fields: [
                { key: 'group_size', type: 'number', label: '模拟用户数分组 (0=全部)', default: 0, min: 0 }
            ]
        },
        BSFTimer: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        BeanShellTimer: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        JSR223Timer: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS },
                { key: 'filename', type: 'text', label: '文件名 (可选)', default: '' },
                { key: 'parameters', type: 'text', label: '参数 (可选)', default: '' }
            ]
        },
        ResponseAssertion: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main_only', options: APPLY_TO_OPTS },
                { key: 'jmeter_variable', type: 'text', label: 'JMeter Variable', default: '' },
                { key: 'test_field', type: 'select', label: '测试字段', default: 'response_text', options: TEST_FIELD_OPTS },
                { key: 'match_mode', type: 'select', label: '匹配模式', default: 'substring', options: MATCH_MODE_OPTS },
                { key: 'patterns', type: 'patterns', label: '模式 / 正则 (每行一条)', default: [] },
                { key: 'custom_message', type: 'text', label: '自定义失败消息', default: '' },
                { key: 'ignore_status', type: 'checkbox', label: 'Ignore status', default: false }
            ]
        },
        JSONPathAssertion: {
            fields: [
                { key: 'json_path', type: 'text', label: 'JSON Path', default: '' },
                { key: 'expected_value', type: 'text', label: 'Expected Value', default: '' },
                { key: 'validate_json', type: 'checkbox', label: 'Additionally assert value', default: false },
                { key: 'is_regex', type: 'checkbox', label: 'Match as regular expression', default: false },
                { key: 'expect_null', type: 'checkbox', label: 'Expect null', default: false },
                { key: 'invert', type: 'checkbox', label: 'Invert', default: false }
            ]
        },
        SizeAssertion: {
            fields: [
                { key: 'test_field', type: 'select', label: '测试字段', default: 'response_text', options: TEST_FIELD_OPTS },
                { key: 'size_bytes', type: 'number', label: 'Size (bytes)', default: 0, min: 0 },
                { key: 'compare', type: 'select', label: '比较', default: 'equals', options: [
                    { val: 'equals', label: '=' }, { val: 'not_equal', label: '!=' },
                    { val: 'greater', label: '>' }, { val: 'less', label: '<' }
                ]}
            ]
        },
        JSONPostProcessor: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
                { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
                { key: 'var', type: 'text', label: 'Names of created variables', default: '' },
                { key: 'json_path', type: 'text', label: 'JSON Path expressions', default: '' },
                { key: 'match_numbers', type: 'text', label: 'Match No.', default: '1' },
                { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
                { key: 'compute_concat', type: 'checkbox', label: 'Compute concatenation', default: false }
            ]
        },
        RegexExtractor: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
                { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
                { key: 'field_to_check', type: 'select', label: 'Field to check', default: 'body', options: FIELD_CHECK_OPTS },
                { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
                { key: 'regex', type: 'text', label: 'Regular Expression', default: '' },
                { key: 'template', type: 'text', label: 'Template', default: '$1$' },
                { key: 'match_number', type: 'text', label: 'Match No.', default: '1' },
                { key: 'default_value', type: 'text', label: 'Default Value', default: '' }
            ]
        },
        XPathExtractor: {
            fields: [
                { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
                { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
                { key: 'xpath_query', type: 'text', label: 'XPath Query', default: '' },
                { key: 'match_number', type: 'text', label: 'Match No.', default: '-1' },
                { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
                { key: 'validate_xml', type: 'checkbox', label: 'Validate XML', default: false }
            ]
        },
        BeanShellPreProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        BeanShellPostProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
            ]
        },
        JSR223PreProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS }
            ]
        },
        JSR223PostProcessor: {
            fields: [
                { key: 'script', type: 'textarea', label: '脚本', default: '' },
                { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS }
            ]
        },
        UserParameters: {
            fields: [
                { key: 'names', type: 'patterns', label: '变量名 (每行一个)', default: [] },
                { key: 'thread_values', type: 'textarea', label: '线程值 (逗号分隔，每行对应一个变量)', default: '' }
            ]
        },
        HeaderManager: {
            fields: [
                { key: 'headers', type: 'kv', label: 'HTTP 信息头', default: [] }
            ]
        },
        Arguments: {
            fields: [
                { key: 'arguments', type: 'kv', label: '用户定义变量', default: [] }
            ]
        },
        ConfigTestElement: {
            fields: [
                { key: 'protocol', type: 'text', label: '协议 (protocol)', default: 'https' },
                { key: 'domain', type: 'text', label: '域名 (domain)', default: '' },
                { key: 'port', type: 'text', label: '端口 (port)', default: '' },
                { key: 'path', type: 'text', label: '路径 (path)', default: '' }
            ]
        },
        BackendListener: {
            fields: [
                { key: 'classname', type: 'text', label: '实现类 (classname)', default: 'org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient' },
                { key: 'influxdbUrl', type: 'text', label: 'Influx URL (influxdbUrl)', default: 'http://127.0.0.1:8086/write?db=jmeter' },
                { key: 'application', type: 'text', label: 'application（Grafana 主维度）', default: '' },
                { key: 'measurement', type: 'text', label: 'measurement', default: 'jmeter' },
                { key: 'eventTags', type: 'text', label: 'eventTags（env/scenario/build）', default: '' }
            ]
        },
        CounterConfig: {
            fields: [
                { key: 'variable_name', type: 'text', label: 'Counter Name', default: '' },
                { key: 'start', type: 'number', label: 'Start', default: 1 },
                { key: 'increment', type: 'number', label: 'Increment', default: 1 },
                { key: 'maximum', type: 'text', label: 'Maximum', default: '' },
                { key: 'format', type: 'text', label: 'Format', default: '' },
                { key: 'per_user', type: 'checkbox', label: 'Track counter independently for each user', default: true }
            ]
        },
﻿
        IfController: {
            fields: [
                { key: 'condition', type: 'textarea', label: '条件 (condition)', default: '' },
                { key: 'evaluate_all', type: 'checkbox', label: 'Evaluate for all children', default: false },
                { key: 'use_expression', type: 'checkbox', label: 'Interpret Condition as Variable Expression', default: true }
            ]
        },
        LoopController: {
            fields: [
                { key: 'loop_forever', type: 'checkbox', label: '永远循环', default: false },
                { key: 'loops', type: 'number', label: '循环次数 (-1=永远)', default: 1, min: -1 }
            ]
        },
        TransactionController: {
            fields: [
                { key: 'generate_parent_sample', type: 'checkbox', label: 'Generate parent sample', default: false },
                { key: 'include_timer_duration', type: 'checkbox', label: 'Include duration of timer', default: true }
            ]
        },
        GenericController: {
            fields: [{ key: 'notes', type: 'textarea', label: '说明', default: '' }]
        },
        RandomController: {
            fields: [
                { key: 'ignore_sub_controller_blocks', type: 'checkbox', label: 'Ignore sub-controller blocks', default: false }
            ]
        },

        XPathAssertion: {
            fields: [
                { key: 'xpath', type: 'textarea', label: 'XPath 表达式', default: '' },
                { key: 'negate', type: 'checkbox', label: '取反 (Negate)', default: false },
                { key: 'validate_xml', type: 'checkbox', label: '验证 XML', default: false }
            ]
        },
        XMLAssertion: {
            fields: [
                { key: 'xml', type: 'textarea', label: 'XML 文档', default: '' },
                { key: 'dtd', type: 'text', label: 'DTD', default: '' },
                { key: 'xpath', type: 'text', label: 'XPath', default: '' }
            ]
        },
        DurationAssertion: {
            fields: [
                { key: 'duration_ms', type: 'number', label: '最大耗时 (毫秒)', default: 0, min: 0 },
                { key: 'compare', type: 'select', label: '比较', default: 'less', options: [
                    { val: 'less', label: '<' }, { val: 'greater', label: '>' }, { val: 'equal', label: '=' }
                ]}
            ]
        },
        JMESPathAssertion: {
            fields: [
                { key: 'jmes_path', type: 'text', label: 'JMESPath 表达式', default: '' },
                { key: 'expected_value', type: 'text', label: '预期值', default: '' },
                { key: 'invert', type: 'checkbox', label: 'Invert', default: false }
            ]
        },
        JDBCPreProcessor: {
            fields: [
                { key: 'data_source', type: 'text', label: '数据源', default: '' },
                { key: 'query', type: 'textarea', label: 'SQL 查询', default: '' },
                { key: 'query_timeout', type: 'text', label: 'Query Timeout', default: '' },
                { key: 'query_type', type: 'select', label: 'Query Type', default: 'Select Statement', options: [
                    { val: 'Select Statement', label: 'Select Statement' },
                    { val: 'Update Statement', label: 'Update Statement' },
                    { val: 'Callable Statement', label: 'Callable Statement' }
                ]}
            ]
        },
        JDBCPostProcessor: {
            fields: [
                { key: 'data_source', type: 'text', label: '数据源', default: '' },
                { key: 'query', type: 'textarea', label: 'SQL 查询', default: '' },
                { key: 'variable_names', type: 'text', label: 'Variable Names', default: '' },
                { key: 'query_timeout', type: 'text', label: 'Query Timeout', default: '' }
            ]
        },
        WhileController: {
            fields: [
                { key: 'condition', type: 'textarea', label: '条件', default: '' }
            ]
        },
        ForEachController: {
            fields: [
                { key: 'input_val', type: 'text', label: '输入变量前缀', default: '' },
                { key: 'return_val', type: 'text', label: '输出变量名', default: '' },
                { key: 'use_separator', type: 'checkbox', label: '使用分隔符', default: true }
            ]
        },
        SummaryReport: {
            fields: [
                { key: 'filename', type: 'text', label: '文件名', default: '' },
                { key: 'log_errors_only', type: 'checkbox', label: '仅记录错误', default: false }
            ]
        },
        TableVisualizer: {
            fields: [
                { key: 'filename', type: 'text', label: '文件名', default: '' },
                { key: 'log_errors_only', type: 'checkbox', label: '仅记录错误', default: false }
            ]
        },

        DebugSampler: {
            fields: [
                { key: 'display_jmeter_variables', type: 'checkbox', label: 'Display JMeter variables', default: true },
                { key: 'display_jmeter_properties', type: 'checkbox', label: 'Display JMeter properties', default: false },
                { key: 'display_system_properties', type: 'checkbox', label: 'Display System properties', default: false }
            ]
        },
        ViewResultsFullVisualizer: {
            fields: [{ key: 'notes', type: 'textarea', label: '监听器说明', default: '' }]
        },
        StatVisualizer: {
            fields: [{ key: 'notes', type: 'textarea', label: '监听器说明', default: '' }]
        },
        CookieManager: {
            fields: [
                { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除 Cookie', default: true },
                { key: 'cookie_policy', type: 'select', label: 'Cookie Policy', default: 'standard', options: [
                    { val: 'standard', label: 'standard' },
                    { val: 'ignoreCookies', label: 'ignoreCookies' },
                    { val: 'netscape', label: 'netscape' }
                ]},
                { key: 'cookies', type: 'kv', label: 'Cookie (name/value)', default: [] }
            ]
        },
        AuthManager: {
            fields: [
                { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除授权', default: false },
                { key: 'authorizations', type: 'kv', label: '授权 (URL/username)', default: [] }
            ]
        },
        CacheManager: {
            fields: [
                { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除缓存', default: false },
                { key: 'use_expires', type: 'checkbox', label: 'Use Expires', default: true },
                { key: 'max_size', type: 'text', label: 'Max cache size (entries)', default: '5000' }
            ]
        },
        HTTPSamplerProxy: {
            fields: [
                { key: 'method', type: 'select', label: 'HTTP 方法', default: 'GET', options: [
                    { val: 'GET', label: 'GET' }, { val: 'POST', label: 'POST' },
                    { val: 'PUT', label: 'PUT' }, { val: 'DELETE', label: 'DELETE' },
                    { val: 'PATCH', label: 'PATCH' }, { val: 'HEAD', label: 'HEAD' }
                ]},
                { key: 'path', type: 'text', label: '路径 (path)', default: '' },
                { key: 'query', type: 'kv', label: '查询参数 (query)', default: [] },
                { key: 'body', type: 'textarea', label: 'Body', default: '' }
            ]
        },

        CSVDataSet: {
            fields: [
                { key: 'filename', type: 'text', label: 'Filename', default: '' },
                { key: 'variable_names', type: 'text', label: 'Variable Names', default: '' },
                { key: 'delimiter', type: 'text', label: 'Delimiter', default: ',' },
                { key: 'recycle', type: 'checkbox', label: 'Recycle on EOF', default: true },
                { key: 'stop_thread', type: 'checkbox', label: 'Stop thread on EOF', default: false },
                { key: 'share_mode', type: 'select', label: 'Sharing mode', default: 'all', options: [
                    { val: 'all', label: 'All threads' },
                    { val: 'group', label: 'Current thread group' },
                    { val: 'thread', label: 'Current thread' }
                ]}
            ]
        }
    };

    var CATEGORY_FALLBACK = {
        timer: [{ key: 'delay_ms', type: 'number', label: '延迟 (毫秒)', default: 300, min: 0 }],
        assertion: [{ key: 'notes', type: 'textarea', label: '说明 / 备注', default: '' }],
        preprocessor: [{ key: 'script', type: 'textarea', label: '脚本 / 配置', default: '' }],
        postprocessor: [{ key: 'script', type: 'textarea', label: '脚本 / 配置', default: '' }],
        config: [{ key: 'notes', type: 'textarea', label: '配置说明', default: '' }],
        listener: [{ key: 'notes', type: 'textarea', label: '监听器说明', default: '' }]
    };

    function getSchema(step) {
        if (!step) return { fields: [] };
        if (step.alias === 'ConfigTestElement' && step.guiclass === 'HttpDefaultsGui') {
            return ALIAS_SCHEMAS.ConfigTestElement;
        }
        if (step.alias && ALIAS_SCHEMAS[step.alias]) return ALIAS_SCHEMAS[step.alias];
        var Ext = global.JmsCatalogSchemaExtend;
        if (Ext && typeof Ext.getSchemaForAlias === 'function') {
            var extSchema = Ext.getSchemaForAlias(step);
            if (extSchema && extSchema.fields && extSchema.fields.length) return extSchema;
        }
        var cat = step.category || 'other';
        return { fields: CATEGORY_FALLBACK[cat] ? CATEGORY_FALLBACK[cat].slice() : [] };
    }

    function defaultProps(step) {
        var schema = getSchema(step);
        var props = { comments: '' };
        (schema.fields || []).forEach(function (f) {
            if (f.key === 'headers') props.headers = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'arguments') props.arguments = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'query') props.query = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'patterns' || f.key === 'names') props[f.key] = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.key === 'cookies' || f.key === 'authorizations') props[f.key] = Array.isArray(f.default) ? f.default.slice() : [];
            else if (f.type === 'checkbox') props[f.key] = !!f.default;
            else if (f.default != null) props[f.key] = f.default;
            else props[f.key] = f.type === 'number' ? 0 : '';
        });
        if (step && step.alias === 'BackendListener') {
            if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.defaultInfluxBackendProps === 'function') {
                var d = global.JmsPlanCatalogResolve.defaultInfluxBackendProps({});
                props.classname = d.classname;
                props.queue_size = d.queue_size;
                props.parameters = d.parameters;
                (d.parameters || []).forEach(function (p) {
                    if (p && p.key && p.key !== 'classname' && p.key !== 'queue_size') props[p.key] = p.value;
                });
            }
        }
        if (step && step.alias === 'ConfigTestElement' && step.guiclass === 'HttpDefaultsGui') {
            props.enabled = true;
            props.follow_redirects = true;
            props.auto_redirects = false;
            props.use_keepalive = true;
        }
        return props;
    }

    function propsForEditor(step) {
        var props = step && step.catalog_props
            ? JSON.parse(JSON.stringify(step.catalog_props))
            : defaultProps(step);
        if (step && step.alias === 'HeaderManager') {
            var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
            if (HN && typeof HN.normalizeHeaderProps === 'function') {
                props = HN.normalizeHeaderProps(props);
            } else if (props.headers != null && !Array.isArray(props.headers) && typeof props.headers === 'object') {
                props.headers = Object.keys(props.headers).map(function (k) {
                    return { key: k, name: k, value: props.headers[k] == null ? '' : String(props.headers[k]) };
                });
            }
        }
        if (step && (step.alias === 'HTTPSamplerProxy' || step.alias === 'HTTPSampler' || step.alias === 'HTTPSampler2')) {
            var QE = global.JmsHttpSamplerQueryEditorV1;
            if (QE && typeof QE.normalizeHttpPropsForEditor === 'function') {
                props = QE.normalizeHttpPropsForEditor(props);
            } else if (props.query != null && !Array.isArray(props.query) && typeof props.query === 'object') {
                props.query = Object.keys(props.query).map(function (k) {
                    return { key: k, name: k, value: props.query[k] == null ? '' : String(props.query[k]) };
                });
            } else if (!Array.isArray(props.query)) {
                props.query = [];
            }
        }
        if (step && step.alias === 'JSONPathAssertion') {
            var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
            if (JA && typeof JA.normalizeJsonAssertProps === 'function') {
                props = JA.normalizeJsonAssertProps(props);
            }
        }
        if (step && step.alias === 'BackendListener' && Array.isArray(props.parameters)) {
            props.parameters.forEach(function (p) {
                if (!p || !p.key || p.key === 'classname' || p.key === 'queue_size') return;
                props[p.key] = p.value == null ? '' : String(p.value);
            });
        }
        return props;
    }

    function persistEditorProps(step, props) {
        if (!step || !props) return props;
        if (step.alias === 'BackendListener') {
            var schema = getSchema(step);
            var paramMap = {};
            (props.parameters || []).forEach(function (p) {
                if (p && p.key) paramMap[p.key] = p.value == null ? '' : String(p.value);
            });
            (schema.fields || []).forEach(function (f) {
                if (!f || !f.key || f.key === 'classname') return;
                if (props[f.key] !== undefined) paramMap[f.key] = props[f.key] == null ? '' : String(props[f.key]);
            });
            var rows = Object.keys(paramMap).map(function (k) {
                return { key: k, value: paramMap[k] };
            });
            if (global.JmsBackendListenerCatalog && typeof global.JmsBackendListenerCatalog.normalizeConfig === 'function') {
                var cfg = global.JmsBackendListenerCatalog.normalizeConfig({
                    name: step.name,
                    comments: props.comments || '',
                    classname: props.classname,
                    queue_size: props.queue_size || '5000',
                    parameters: rows
                });
                return {
                    comments: cfg.comments,
                    classname: cfg.classname,
                    queue_size: cfg.queue_size,
                    parameters: cfg.parameters
                };
            }
            return {
                comments: props.comments || '',
                classname: props.classname,
                queue_size: props.queue_size || '5000',
                parameters: rows
            };
        }
        if (step.alias === 'JSONPathAssertion') {
            var JA2 = global.JmsJmxImportJsonAssertPropsNormalizeV1;
            if (JA2 && typeof JA2.toLegacyProps === 'function') {
                return JA2.toLegacyProps(props);
            }
            return {
                comments: props.comments || '',
                json_path: props.json_path || '',
                expected: props.expected_value == null ? '' : String(props.expected_value),
                additionally_assert_value: !!props.validate_json,
                is_regex: !!props.is_regex,
                expect_null: !!props.expect_null,
                invert: !!props.invert
            };
        }
        return props;
    }

    global.JmsCatalogElementEditorSchema = {
        getSchema: getSchema,
        defaultProps: defaultProps,
        propsForEditor: propsForEditor,
        persistEditorProps: persistEditorProps,
        ALIAS_SCHEMAS: ALIAS_SCHEMAS
    };
})(window);
