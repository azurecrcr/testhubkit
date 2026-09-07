/**
 * Backend Listener · 数据模型（隔离模块，TG / HTTP 步骤共用，默认值对齐 JMeter GUI）
 */
(function (global) {
    'use strict';

    var GRAPHITE_CN = 'org.apache.jmeter.visualizers.backend.graphite.GraphiteBackendListenerClient';
    var INFLUX_RAW_CN = 'org.apache.jmeter.visualizers.backend.influxdb.InfluxDBRawBackendListenerClient';
    var INFLUX_CN = 'org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient';

    var IMPLEMENTATIONS = [
        { value: GRAPHITE_CN, label: GRAPHITE_CN },
        { value: INFLUX_RAW_CN, label: INFLUX_RAW_CN },
        { value: INFLUX_CN, label: INFLUX_CN }
    ];

    var DEFAULT_GRAPHITE_PARAMS = [
        { key: 'graphiteMetricsSender', value: 'org.apache.jmeter.visualizers.backend.graphite.TextGraphiteMetricsSender' },
        { key: 'graphiteHost', value: '' },
        { key: 'graphitePort', value: '2003' },
        { key: 'rootMetricsPrefix', value: 'jmeter.' },
        { key: 'summaryOnly', value: 'true' },
        { key: 'samplersList', value: '' },
        { key: 'useRegexpForSamplersList', value: 'false' },
        { key: 'percentiles', value: '90;95;99' }
    ];

    var DEFAULT_INFLUX_RAW_PARAMS = [
        { key: 'influxdbMetricsSender', value: 'org.apache.jmeter.visualizers.backend.influxdb.HttpMetricsSender' },
        { key: 'influxdbUrl', value: 'http://host_to_change:8086/write?db=jmeter' },
        { key: 'influxdbToken', value: '' },
        { key: 'measurement', value: 'jmeter' }
    ];

    var DEFAULT_INFLUX_PARAMS = [
        { key: 'influxdbMetricsSender', value: 'org.apache.jmeter.visualizers.backend.influxdb.HttpMetricsSender' },
        { key: 'influxdbUrl', value: 'http://127.0.0.1:8086/write?db=jmeter' },
        { key: 'application', value: 'application name' },
        { key: 'measurement', value: 'jmeter' },
        { key: 'summaryOnly', value: 'false' },
        { key: 'samplersRegex', value: '.*' },
        { key: 'percentiles', value: '99;95;90' },
        { key: 'testTitle', value: 'Test name' },
        { key: 'eventTags', value: '' }
    ];

    function isGraphiteClassname(classname) {
        return classname && String(classname).indexOf('graphite') >= 0;
    }

    function isInfluxRawClassname(classname) {
        return classname && String(classname).indexOf('InfluxDBRaw') >= 0;
    }

    function defaultParamsForClassname(classname) {
        if (isGraphiteClassname(classname)) return cloneParams(DEFAULT_GRAPHITE_PARAMS);
        if (isInfluxRawClassname(classname)) return cloneParams(DEFAULT_INFLUX_RAW_PARAMS);
        return cloneParams(DEFAULT_INFLUX_PARAMS);
    }

    function cloneParams(list) {
        return (list || []).map(function (p) {
            return { key: String(p.key || ''), value: p.value == null ? '' : String(p.value) };
        });
    }

    function defaultConfig() {
        return {
            name: '后端监听器',
            comments: '',
            classname: GRAPHITE_CN,
            queue_size: '5000',
            parameters: cloneParams(DEFAULT_GRAPHITE_PARAMS)
        };
    }

    function defaultConfigFromListenerData(listenerData) {
        var cfg = defaultConfig();
        if (!listenerData || !listenerData.influxdb || listenerData.influxdb.enabled === false) {
            return cfg;
        }
        var inf = listenerData.influxdb || {};
        var tags = inf.tags || {};
        var eventTags = [];
        if (tags.scenario) eventTags.push('scenario=' + tags.scenario);
        if (tags.env || listenerData.env) eventTags.push('env=' + (tags.env || listenerData.env));
        if (listenerData.build) {
            var buildVal = String(listenerData.build);
            eventTags.push(buildVal.indexOf('${') >= 0 ? 'build=${__P(build,unknown)}' : ('build=' + buildVal));
        } else {
            eventTags.push('build=${__P(build,unknown)}');
        }
        cfg.classname = INFLUX_CN;
        cfg.parameters = cloneParams(DEFAULT_INFLUX_PARAMS).map(function (p) {
            if (p.key === 'influxdbUrl') return { key: p.key, value: inf.url || p.value };
            if (p.key === 'application') return { key: p.key, value: inf.application || p.value };
            if (p.key === 'measurement') return { key: p.key, value: inf.measurement || p.value };
            if (p.key === 'testTitle') return { key: p.key, value: listenerData.name || p.value };
            if (p.key === 'eventTags') return { key: p.key, value: eventTags.join(',') || p.value };
            return { key: p.key, value: p.value };
        });
        return cfg;
    }

    function normalizeConfig(raw) {
        if (!raw || typeof raw !== 'object') return defaultConfig();
        var classname = raw.classname ? String(raw.classname) : defaultConfig().classname;
        var params = [];
        if (Array.isArray(raw.parameters)) {
            raw.parameters.forEach(function (row) {
                if (!row) return;
                var k = String(row.key || row.name || '').trim();
                if (k) params.push({ key: k, value: row.value == null ? '' : String(row.value) });
            });
        }
        if (!params.length) params = defaultParamsForClassname(classname);
        return {
            name: raw.name !== undefined ? String(raw.name) : '后端监听器',
            comments: raw.comments !== undefined ? String(raw.comments) : '',
            classname: classname,
            queue_size: raw.queue_size !== undefined ? String(raw.queue_size)
                : (raw.queueSize !== undefined ? String(raw.queueSize) : '5000'),
            parameters: params,
            enabled: raw.enabled !== false
        };
    }

    function configToYaml(cfg) {
        cfg = normalizeConfig(cfg);
        var out = {
            name: cfg.name,
            classname: cfg.classname,
            queue_size: cfg.queue_size,
            parameters: cfg.parameters.map(function (p) { return { key: p.key, value: p.value }; })
        };
        if (cfg.comments) out.comments = cfg.comments;
        return out;
    }

    function listenerItemFromConfig(cfg) {
        cfg = normalizeConfig(cfg);
        return {
            name: cfg.name,
            comments: cfg.comments,
            classname: cfg.classname,
            queue_size: cfg.queue_size,
            parameters: cloneParams(cfg.parameters)
        };
    }

    function paramsEqual(a, b) {
        a = a || [];
        b = b || [];
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (String(a[i].key) !== String(b[i].key)) return false;
            if (String(a[i].value) !== String(b[i].value)) return false;
        }
        return true;
    }

    global.JmsBackendListenerCatalog = {
        GRAPHITE_CN: GRAPHITE_CN,
        INFLUX_RAW_CN: INFLUX_RAW_CN,
        INFLUX_CN: INFLUX_CN,
        IMPLEMENTATIONS: IMPLEMENTATIONS,
        DEFAULT_GRAPHITE_PARAMS: DEFAULT_GRAPHITE_PARAMS,
        DEFAULT_INFLUX_RAW_PARAMS: DEFAULT_INFLUX_RAW_PARAMS,
        DEFAULT_INFLUX_PARAMS: DEFAULT_INFLUX_PARAMS,
        defaultConfig: defaultConfig,
        defaultConfigFromListenerData: defaultConfigFromListenerData,
        defaultParamsForClassname: defaultParamsForClassname,
        isGraphiteClassname: isGraphiteClassname,
        isInfluxRawClassname: isInfluxRawClassname,
        paramsEqual: paramsEqual,
        normalizeConfig: normalizeConfig,
        configToYaml: configToYaml,
        listenerItemFromConfig: listenerItemFromConfig,
        cloneParams: cloneParams
    };
}(typeof window !== 'undefined' ? window : this));
