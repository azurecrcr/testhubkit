/**
 * JMX 导出 · Backend Listener eventTags V2（隔离模块）
 */
(function (global) {
    'use strict';
    function mergeTags(rootData, listenerData) {
        var rootInf = (rootData && rootData.influxdb) || {};
        var listenerInf = (listenerData && listenerData.influxdb) || {};
        return Object.assign({}, rootInf.tags || {}, listenerInf.tags || {});
    }
    function buildEventTagsV2(listenerData, rootData) {
        listenerData = listenerData || {};
        rootData = rootData || {};
        var tags = mergeTags(rootData, listenerData);
        var parts = [];
        var env = tags.env || listenerData.env || rootData.env || 'staging';
        parts.push('env=' + String(env));
        if (tags.scenario) parts.push('scenario=' + String(tags.scenario));
        parts.push('build=${__P(build,unknown)}');
        return parts.join(',');
    }
    function applyToParameters(parameters, listenerData, rootData) {
        var value = buildEventTagsV2(listenerData, rootData);
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
    global.JmsBackendListenerEventTagsV2 = {
        buildEventTagsV2: buildEventTagsV2,
        applyToParameters: applyToParameters
    };
}(typeof window !== 'undefined' ? window : this));
