/**
 * JMeter catalog · 全量 alias schema 扩展（由 jmeter_component_catalog.json 生成）
 * 未在 ALIAS_SCHEMAS 中定义的 alias 使用类别/名称模式回退字段。
 */
(function (global) {
    'use strict';

    var LANG_OPTS = [
        { val: 'groovy', label: 'groovy' },
        { val: 'javascript', label: 'javascript' },
        { val: 'beanshell', label: 'beanshell' },
        { val: 'jython', label: 'jython' }
    ];

    var SCRIPT_FIELDS = [
        { key: 'script', type: 'textarea', label: '脚本', default: '' },
        { key: 'language', type: 'select', label: '语言', default: 'beanshell', options: LANG_OPTS }
    ];

    var JSR223_FIELDS = [
        { key: 'script', type: 'textarea', label: '脚本', default: '' },
        { key: 'language', type: 'select', label: '语言', default: 'groovy', options: LANG_OPTS },
        { key: 'filename', type: 'text', label: '文件名 (可选)', default: '' },
        { key: 'parameters', type: 'text', label: '参数 (可选)', default: '' }
    ];

    var ALIAS_META = {
    "BSFAssertion": {
        "category": "assertion",
        "label_zh": "BSFAssertion"
    },
    "BeanShellAssertion": {
        "category": "assertion",
        "label_zh": "BeanShell 断言"
    },
    "CompareAssertion": {
        "category": "assertion",
        "label_zh": "CompareAssertion"
    },
    "HTMLAssertion": {
        "category": "assertion",
        "label_zh": "HTMLAssertion"
    },
    "JMESPathAssertion": {
        "category": "assertion",
        "label_zh": "JMESPathAssertion"
    },
    "JSONPathAssertion": {
        "category": "assertion",
        "label_zh": "JSON 断言"
    },
    "JSR223Assertion": {
        "category": "assertion",
        "label_zh": "JSR223 断言"
    },
    "MD5HexAssertion": {
        "category": "assertion",
        "label_zh": "MD5 断言"
    },
    "MD5HexAssertionGUI": {
        "category": "assertion",
        "label_zh": "MD5HexAssertionGUI"
    },
    "SMIMEAssertion": {
        "category": "assertion",
        "label_zh": "SMIMEAssertion"
    },
    "SubstitutionElement": {
        "category": "assertion",
        "label_zh": "SubstitutionElement"
    },
    "XMLAssertion": {
        "category": "assertion",
        "label_zh": "XML 断言"
    },
    "XMLSchemaAssertion": {
        "category": "assertion",
        "label_zh": "XMLSchemaAssertion"
    },
    "XMLSchemaAssertionGUI": {
        "category": "assertion",
        "label_zh": "XMLSchemaAssertionGUI"
    },
    "XPathAssertion": {
        "category": "assertion",
        "label_zh": "XPath 断言"
    },
    "XPath2Assertion": {
        "category": "assertion",
        "label_zh": "XPath2 断言"
    },
    "assertionResult": {
        "category": "assertion",
        "label_zh": "assertionResult"
    },
    "ResponseAssertion": {
        "category": "assertion",
        "label_zh": "响应断言"
    },
    "SizeAssertion": {
        "category": "assertion",
        "label_zh": "大小断言"
    },
    "DurationAssertion": {
        "category": "assertion",
        "label_zh": "持续时间断言"
    },
    "BoltConnectionElement": {
        "category": "config",
        "label_zh": "BoltConnectionElement"
    },
    "CSVDataSet": {
        "category": "config",
        "label_zh": "CSV 数据文件设置"
    },
    "ConfigTestElement": {
        "category": "config",
        "label_zh": "HTTP 请求默认值"
    },
    "JDBCDataSource": {
        "category": "config",
        "label_zh": "JDBCDataSource"
    },
    "JavaConfig": {
        "category": "config",
        "label_zh": "JavaConfig"
    },
    "KeystoreConfig": {
        "category": "config",
        "label_zh": "Keystore 配置"
    },
    "LDAPArgument": {
        "category": "config",
        "label_zh": "LDAPArgument"
    },
    "LDAPArguments": {
        "category": "config",
        "label_zh": "LDAPArguments"
    },
    "MongoSourceElement": {
        "category": "config",
        "label_zh": "MongoSourceElement"
    },
    "LoginConfig": {
        "category": "config",
        "label_zh": "登录配置"
    },
    "InterThread Communication": {
        "category": "config",
        "label_zh": "线程间通信"
    },
    "RandomVariableConfig": {
        "category": "config",
        "label_zh": "随机变量"
    },
    "Authorization": {
        "category": "controller",
        "label_zh": "Authorization"
    },
    "Cookie": {
        "category": "controller",
        "label_zh": "Cookie"
    },
    "DNSCacheManager": {
        "category": "controller",
        "label_zh": "DNS 缓存管理器"
    },
    "ForeachController": {
        "category": "controller",
        "label_zh": "ForeachController"
    },
    "GenericController": {
        "category": "controller",
        "label_zh": "GenericController"
    },
    "CookieManager": {
        "category": "controller",
        "label_zh": "HTTP Cookie 管理器"
    },
    "Arguments": {
        "category": "config",
        "label_zh": "用户定义的变量"
    },
    "HeaderManager": {
        "category": "config",
        "label_zh": "HTTP 信息头管理器"
    },
    "AuthManager": {
        "category": "controller",
        "label_zh": "HTTP 授权管理器"
    },
    "CacheManager": {
        "category": "controller",
        "label_zh": "HTTP 缓存管理器"
    },
    "Header": {
        "category": "controller",
        "label_zh": "Header"
    },
    "HttpMirrorControl": {
        "category": "controller",
        "label_zh": "HttpMirrorControl"
    },
    "HttpTestSampleGui,HttpTestSampleGui2": {
        "category": "controller",
        "label_zh": "HttpTestSampleGui,HttpTestSampleGui2"
    },
    "IfController": {
        "category": "controller",
        "label_zh": "If 控制器"
    },
    "IncludeController": {
        "category": "controller",
        "label_zh": "Include 控制器"
    },
    "RecordController": {
        "category": "controller",
        "label_zh": "RecordController"
    },
    "StaticHost": {
        "category": "controller",
        "label_zh": "StaticHost"
    },
    "SwitchController": {
        "category": "controller",
        "label_zh": "Switch 控制器"
    },
    "TransactionSampler": {
        "category": "controller",
        "label_zh": "TransactionSampler"
    },
    "WhileController": {
        "category": "controller",
        "label_zh": "While 控制器"
    },
    "CriticalSectionController": {
        "category": "controller",
        "label_zh": "临界区控制器"
    },
    "TransactionController": {
        "category": "controller",
        "label_zh": "事务控制器"
    },
    "InterleaveControl": {
        "category": "controller",
        "label_zh": "交替控制器"
    },
    "OnceOnlyController": {
        "category": "controller",
        "label_zh": "仅一次控制器"
    },
    "ThroughputController": {
        "category": "controller",
        "label_zh": "吞吐量控制器"
    },
    "RecordingController": {
        "category": "controller",
        "label_zh": "录制控制器"
    },
    "LoopController": {
        "category": "controller",
        "label_zh": "循环控制器"
    },
    "ModuleController": {
        "category": "controller",
        "label_zh": "模块控制器"
    },
    "TestFragmentController": {
        "category": "controller",
        "label_zh": "测试片段"
    },
    "RunTime": {
        "category": "controller",
        "label_zh": "运行时间控制器"
    },
    "RandomController": {
        "category": "controller",
        "label_zh": "随机控制器"
    },
    "RandomOrderController": {
        "category": "controller",
        "label_zh": "随机顺序控制器"
    },
    "BSFListener": {
        "category": "listener",
        "label_zh": "BSFListener"
    },
    "BackendListener": {
        "category": "listener",
        "label_zh": "Backend Listener"
    },
    "BeanShellListener": {
        "category": "listener",
        "label_zh": "BeanShellListener"
    },
    "JSR223Listener": {
        "category": "listener",
        "label_zh": "JSR223Listener"
    },
    "MailerResultCollector": {
        "category": "listener",
        "label_zh": "MailerResultCollector"
    },
    "PerfMon Metrics Collector": {
        "category": "listener",
        "label_zh": "PerfMon 性能监控"
    },
    "ResultAction": {
        "category": "listener",
        "label_zh": "ResultAction"
    },
    "SimpleDataWriter": {
        "category": "listener",
        "label_zh": "SimpleDataWriter"
    },
    "Summariser": {
        "category": "listener",
        "label_zh": "Summariser"
    },
    "monitorStats": {
        "category": "listener",
        "label_zh": "monitorStats"
    },
    "SummaryReport": {
        "category": "listener",
        "label_zh": "汇总报告"
    },
    "Flexible File Writer": {
        "category": "listener",
        "label_zh": "灵活文件写入器"
    },
    "ResultCollector": {
        "category": "listener",
        "label_zh": "结果收集器"
    },
    "AnchorModifier": {
        "category": "other",
        "label_zh": "AnchorModifier"
    },
    "ProxyControl": {
        "category": "other",
        "label_zh": "HTTP(S) 测试脚本录制"
    },
    "HTTPArgument": {
        "category": "other",
        "label_zh": "HTTPArgument"
    },
    "HTTPFileArg": {
        "category": "other",
        "label_zh": "HTTPFileArg"
    },
    "HTTPFileArgs": {
        "category": "other",
        "label_zh": "HTTPFileArgs"
    },
    "JDBCPostProcessor": {
        "category": "other",
        "label_zh": "JDBCPostProcessor"
    },
    "JDBCPreProcessor": {
        "category": "other",
        "label_zh": "JDBCPreProcessor"
    },
    "JavaTest": {
        "category": "other",
        "label_zh": "JavaTest"
    },
    "ParamMask": {
        "category": "other",
        "label_zh": "ParamMask"
    },
    "ParamModifier": {
        "category": "other",
        "label_zh": "ParamModifier"
    },
    "RegExUserParameters": {
        "category": "other",
        "label_zh": "RegExUserParameters"
    },
    "SampleTimeout": {
        "category": "other",
        "label_zh": "SampleTimeout"
    },
    "TestBeanGUI": {
        "category": "other",
        "label_zh": "TestBeanGUI"
    },
    "URLRewritingModifier": {
        "category": "other",
        "label_zh": "URLRewritingModifier"
    },
    "UserParameterModifier": {
        "category": "other",
        "label_zh": "UserParameterModifier"
    },
    "UserParameters": {
        "category": "other",
        "label_zh": "UserParameters"
    },
    "boolProp": {
        "category": "other",
        "label_zh": "boolProp"
    },
    "collectionProp": {
        "category": "other",
        "label_zh": "collectionProp"
    },
    "doubleProp": {
        "category": "other",
        "label_zh": "doubleProp"
    },
    "elementProp": {
        "category": "other",
        "label_zh": "elementProp"
    },
    "hashTree": {
        "category": "other",
        "label_zh": "hashTree"
    },
    "intProp": {
        "category": "other",
        "label_zh": "intProp"
    },
    "jmeterTestPlan": {
        "category": "other",
        "label_zh": "jmeterTestPlan"
    },
    "longProp": {
        "category": "other",
        "label_zh": "longProp"
    },
    "mapProp": {
        "category": "other",
        "label_zh": "mapProp"
    },
    "objProp": {
        "category": "other",
        "label_zh": "objProp"
    },
    "sample": {
        "category": "other",
        "label_zh": "sample"
    },
    "sampleEvent": {
        "category": "other",
        "label_zh": "sampleEvent"
    },
    "statSample": {
        "category": "other",
        "label_zh": "statSample"
    },
    "stringProp": {
        "category": "other",
        "label_zh": "stringProp"
    },
    "testResults": {
        "category": "other",
        "label_zh": "testResults"
    },
    "CounterConfig": {
        "category": "other",
        "label_zh": "计数器"
    },
    "BSFPostProcessor": {
        "category": "postprocessor",
        "label_zh": "BSFPostProcessor"
    },
    "BeanShellPostProcessor": {
        "category": "postprocessor",
        "label_zh": "BeanShell 后置处理器"
    },
    "DebugPostProcessor": {
        "category": "postprocessor",
        "label_zh": "DebugPostProcessor"
    },
    "HtmlExtractor": {
        "category": "postprocessor",
        "label_zh": "HtmlExtractor"
    },
    "JMESPathExtractor": {
        "category": "postprocessor",
        "label_zh": "JMESPath 提取器"
    },
    "JSONPostProcessor": {
        "category": "postprocessor",
        "label_zh": "JSON 提取器"
    },
    "JSR223PostProcessor": {
        "category": "postprocessor",
        "label_zh": "JSR223 后置处理器"
    },
    "XPathExtractor": {
        "category": "postprocessor",
        "label_zh": "XPath 提取器"
    },
    "XPath2Extractor": {
        "category": "postprocessor",
        "label_zh": "XPath2 提取器"
    },
    "RegexExtractor": {
        "category": "postprocessor",
        "label_zh": "正则表达式提取器"
    },
    "BoundaryExtractor": {
        "category": "postprocessor",
        "label_zh": "边界提取器"
    },
    "BSFPreProcessor": {
        "category": "preprocessor",
        "label_zh": "BSFPreProcessor"
    },
    "BeanShellPreProcessor": {
        "category": "preprocessor",
        "label_zh": "BeanShell 前置处理器"
    },
    "JSR223PreProcessor": {
        "category": "preprocessor",
        "label_zh": "JSR223 前置处理器"
    },
    "AjpSampler": {
        "category": "sampler",
        "label_zh": "AJP 请求"
    },
    "BSFSampler": {
        "category": "sampler",
        "label_zh": "BSF 取样器"
    },
    "BeanShellSampler": {
        "category": "sampler",
        "label_zh": "BeanShell 取样器"
    },
    "BoltSampler": {
        "category": "sampler",
        "label_zh": "Bolt 请求"
    },
    "DebugSampler": {
        "category": "sampler",
        "label_zh": "Debug 取样器"
    },
    "Dummy Sampler": {
        "category": "sampler",
        "label_zh": "Dummy 取样器"
    },
    "FTPSampler": {
        "category": "sampler",
        "label_zh": "FTPSampler"
    },
    "HTTPSampler2_": {
        "category": "sampler",
        "label_zh": "HTTPSampler2_"
    },
    "HTTPSamplerProxy,HTTPSampler,HTTPSampler2": {
        "category": "sampler",
        "label_zh": "HTTPSamplerProxy,HTTPSampler,HTTPSampler2"
    },
    "HTTPSampler_": {
        "category": "sampler",
        "label_zh": "HTTPSampler_"
    },
    "JDBCSampler": {
        "category": "sampler",
        "label_zh": "JDBC 请求"
    },
    "PublisherSampler": {
        "category": "sampler",
        "label_zh": "JMS 发布"
    },
    "JMSSampler": {
        "category": "sampler",
        "label_zh": "JMS 点对点"
    },
    "SubscriberSampler": {
        "category": "sampler",
        "label_zh": "JMS 订阅"
    },
    "JMSProperties": {
        "category": "sampler",
        "label_zh": "JMSProperties"
    },
    "JSR223Sampler": {
        "category": "sampler",
        "label_zh": "JSR223 取样器"
    },
    "JUnitSampler": {
        "category": "sampler",
        "label_zh": "JUnit 请求"
    },
    "JavaSampler": {
        "category": "sampler",
        "label_zh": "Java 请求"
    },
    "LDAPExtSampler": {
        "category": "sampler",
        "label_zh": "LDAP 扩展请求"
    },
    "LDAPSampler": {
        "category": "sampler",
        "label_zh": "LDAP 请求"
    },
    "MongoScriptSampler": {
        "category": "sampler",
        "label_zh": "MongoDB 脚本"
    },
    "SmtpSampler": {
        "category": "sampler",
        "label_zh": "SMTP 取样器"
    },
    "SoapSampler": {
        "category": "sampler",
        "label_zh": "SoapSampler"
    },
    "SystemSampler": {
        "category": "sampler",
        "label_zh": "SystemSampler"
    },
    "TCPSampler": {
        "category": "sampler",
        "label_zh": "TCPSampler"
    },
    "TestAction": {
        "category": "sampler",
        "label_zh": "TestAction"
    },
    "WebServiceSampler": {
        "category": "sampler",
        "label_zh": "WebServiceSampler"
    },
    "httpSample": {
        "category": "sampler",
        "label_zh": "httpSample"
    },
    "AccessLogSampler": {
        "category": "sampler",
        "label_zh": "访问日志取样器"
    },
    "MailReaderSampler": {
        "category": "sampler",
        "label_zh": "邮件读取取样器"
    },
    "WorkBench": {
        "category": "test_plan",
        "label_zh": "WorkBench"
    },
    "TestPlan": {
        "category": "test_plan",
        "label_zh": "测试计划"
    },
    "Custom Thread Groups": {
        "category": "thread_group",
        "label_zh": "Concurrency Thread Group"
    },
    "OpenModelThreadGroupController": {
        "category": "thread_group",
        "label_zh": "OpenModelThreadGroupController"
    },
    "PostThreadGroup": {
        "category": "thread_group",
        "label_zh": "Post 线程组"
    },
    "ReflectionThreadGroup": {
        "category": "thread_group",
        "label_zh": "ReflectionThreadGroup"
    },
    "SetupThreadGroup": {
        "category": "thread_group",
        "label_zh": "SetUp 线程组"
    },
    "OpenModelThreadGroup": {
        "category": "thread_group",
        "label_zh": "开放模型线程组"
    },
    "ThreadGroup": {
        "category": "thread_group",
        "label_zh": "线程组"
    },
    "BSFTimer": {
        "category": "timer",
        "label_zh": "BSFTimer"
    },
    "BeanShellTimer": {
        "category": "timer",
        "label_zh": "BeanShell 定时器"
    },
    "JSR223Timer": {
        "category": "timer",
        "label_zh": "JSR223 定时器"
    },
    "SyncTimer": {
        "category": "timer",
        "label_zh": "同步定时器"
    },
    "Throughput Shaping Timer": {
        "category": "timer",
        "label_zh": "吞吐量 shaping 定时器"
    },
    "ConstantTimer": {
        "category": "timer",
        "label_zh": "固定定时器"
    },
    "UniformRandomTimer": {
        "category": "timer",
        "label_zh": "均匀随机定时器"
    },
    "ConstantThroughputTimer": {
        "category": "timer",
        "label_zh": "常数吞吐量定时器"
    },
    "PoissonRandomTimer": {
        "category": "timer",
        "label_zh": "泊松随机定时器"
    },
    "PreciseThroughputTimer": {
        "category": "timer",
        "label_zh": "精确吞吐量定时器"
    },
    "GaussianRandomTimer": {
        "category": "timer",
        "label_zh": "高斯随机定时器"
    }
};

    var CONTROLLER_FIELDS = {
        WhileController: [
            { key: 'condition', type: 'textarea', label: '条件', default: '' }
        ],
        ForEachController: [
            { key: 'input_val', type: 'text', label: '输入变量前缀', default: '' },
            { key: 'return_val', type: 'text', label: '输出变量名称', default: '' }
        ],
        ModuleController: [
            { key: 'module_path', type: 'text', label: '模块路径', default: '' }
        ],
        IncludeController: [
            { key: 'include_path', type: 'text', label: 'JMX 文件路径', default: '' }
        ],
        ThroughputController: [
            { key: 'style', type: 'select', label: '样式', default: 'percent', options: [
                { val: 'percent', label: 'Percent executions' },
                { val: 'total', label: 'Total executions' }
            ]},
            { key: 'throughput', type: 'number', label: 'Throughput', default: 1, min: 0 }
        ],
        SwitchController: [
            { key: 'switch_value', type: 'text', label: 'Switch Value', default: '' }
        ],
        RunTimeController: [
            { key: 'seconds', type: 'number', label: '运行时间 (秒)', default: 60, min: 0 }
        ],
        InterleaveController: [
            { key: 'interleave', type: 'checkbox', label: 'Ignore sub-controller blocks', default: false }
        ]
    };

    var CATEGORY_FIELDS = {
        timer: [{ key: 'delay_ms', type: 'number', label: '延迟 (毫秒)', default: 300, min: 0 }],
        assertion: [
            { key: 'test_field', type: 'text', label: '测试字段', default: '' },
            { key: 'pattern', type: 'textarea', label: '模式 / 表达式', default: '' }
        ],
        preprocessor: SCRIPT_FIELDS.slice(),
        postprocessor: SCRIPT_FIELDS.slice(),
        config: [{ key: 'notes', type: 'textarea', label: '配置说明', default: '' }],
        listener: [{ key: 'filename', type: 'text', label: '文件名 (可选)', default: '' }],
        sampler: [
            { key: 'protocol', type: 'text', label: '协议', default: '' },
            { key: 'domain', type: 'text', label: '域名', default: '' },
            { key: 'path', type: 'text', label: '路径', default: '' }
        ],
        controller: [{ key: 'comments', type: 'textarea', label: '备注', default: '' }],
        other: [{ key: 'notes', type: 'textarea', label: '说明', default: '' }]
    };

    function cloneFields(list) {
        return (list || []).map(function (f) {
            var o = {};
            Object.keys(f).forEach(function (k) { o[k] = f[k]; });
            if (Array.isArray(f.options)) o.options = f.options.slice();
            return o;
        });
    }

    function resolveByPattern(alias, category) {
        if (!alias) return null;
        if (CONTROLLER_FIELDS[alias]) return { fields: cloneFields(CONTROLLER_FIELDS[alias]) };
        if (/BeanShell|BSF/.test(alias)) return { fields: cloneFields(SCRIPT_FIELDS) };
        if (/^JSR223/.test(alias)) return { fields: cloneFields(JSR223_FIELDS) };
        if (/Assertion$/.test(alias) || /AssertionGUI$/.test(alias)) {
            return { fields: cloneFields(CATEGORY_FIELDS.assertion) };
        }
        if (/PostProcessor$/.test(alias) || /PreProcessor$/.test(alias)) {
            return { fields: cloneFields(SCRIPT_FIELDS) };
        }
        if (/Timer$/.test(alias)) return { fields: cloneFields(CATEGORY_FIELDS.timer) };
        if (/Sampler$/.test(alias) || category === 'sampler') {
            return { fields: cloneFields(CATEGORY_FIELDS.sampler) };
        }
        if (category && CATEGORY_FIELDS[category]) {
            return { fields: cloneFields(CATEGORY_FIELDS[category]) };
        }
        return { fields: cloneFields(CATEGORY_FIELDS.other) };
    }

    function getSchemaForAlias(step) {
        if (!step) return { fields: [] };
        var alias = step.alias || '';
        var meta = ALIAS_META[alias];
        var category = (meta && meta.category) || step.category || 'other';
        var schema = resolveByPattern(alias, category);
        if (schema && schema.fields && schema.fields.length) {
            schema.fields.unshift({ key: 'comments', type: 'textarea', label: '注释', default: '' });
            if (category === 'other' || category === 'listener') {
                schema.fields.push({ key: 'jmx_fragment', type: 'textarea', label: 'JMX 片段 (高级)', default: '' });
            }
        }
        return schema || { fields: [] };
    }

    function aliasCount() { return Object.keys(ALIAS_META).length; }

    global.JmsCatalogSchemaExtend = {
        ALIAS_META: ALIAS_META,
        getSchemaForAlias: getSchemaForAlias,
        aliasCount: aliasCount
    };
})(typeof window !== 'undefined' ? window : this);
