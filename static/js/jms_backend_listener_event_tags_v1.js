/**
 * JMX 导出 · Backend Listener eventTags 统一生成（隔离模块）
 */
(function (global) {
    'use strict';

    function buildEventTags(listenerData, rootData) {
        listenerData = listenerData || {};
        rootData = rootData || {};
        var rootInf = rootData.influxdb || {};
        var listenerInf = listenerData.influxdb || {};
        var tags = Object.assign({}, rootInf.tags || {}, listenerInf.tags || {});
        var parts = [];
        var env = tags.env || listenerData.env || rootData.env;
        if (env) parts.push('env=' + String(env));
        if (tags.scenario) parts.push('scenario=' + String(tags.scenario));
        var buildVal = listenerData.build || rootData.build;
        if (buildVal && String(buildVal).indexOf('${') >= 0) {
            parts.push('build=${__P(build,unknown)}');
        } else if (buildVal) {
            parts.push('build=' + String(buildVal));
        } else {
            parts.push('build=${__P(build,unknown)}');
        }
        return parts.join(',');
    }

    function applyToParameters(parameters, listenerData, rootData) {
        var value = buildEventTags(listenerData, rootData);
        var found = false;
        var out = (parameters || []).map(function (p) {
            if (p && p.key === 'eventTags') {
                found = true;
                return { key: 'eventTags', value: value };
            }
            return p;
        });
        if (!found) out.push({ key: 'eventTags', value: value });
        return out;
    }

    global.JmsBackendListenerEventTagsV1 = {
        buildEventTags: buildEventTags,
        applyToParameters: applyToParameters
    };
}(typeof window !== 'undefined' ? window : this));
