/**
 * Backend Listener eventTags V3（两级统一，export-only）
 */
(function (global) {
    'use strict';
    function pickTag(name, listenerData, rootData) {
        var lt = (listenerData && listenerData.influxdb && listenerData.influxdb.tags) || {};
        var rt = (rootData && rootData.influxdb && rootData.influxdb.tags) || {};
        var cp = (listenerData && listenerData.catalog_props && listenerData.catalog_props.parameters) || [];
        var fromParams = null;
        (cp || []).forEach(function (p) {
            if (p && p.key === 'eventTags' && p.value) {
                var m = String(p.value).match(new RegExp(name + '=([^,]+)'));
                if (m) fromParams = m[1];
            }
        });
        return lt[name] || rt[name] || listenerData[name] || rootData[name] || fromParams || null;
    }
    function buildEventTagsV3(listenerData, rootData) {
        listenerData = listenerData || {};
        rootData = rootData || {};
        var env = pickTag('env', listenerData, rootData) || 'staging';
        var scenario = pickTag('scenario', listenerData, rootData) || (rootData.name ? String(rootData.name) : 'default');
        return 'env=' + String(env) + ',scenario=' + String(scenario) + ',build=${__P(build,unknown)}';
    }
    function applyToParameters(parameters, listenerData, rootData) {
        var value = buildEventTagsV3(listenerData, rootData);
        var found = false;
        var out = (parameters || []).map(function (p) {
            if (p && p.key === 'eventTags') { found = true; return { key: 'eventTags', value: value }; }
            return p;
        });
        if (!found) out.push({ key: 'eventTags', value: value });
        return out;
    }
    global.JmsBackendListenerEventTagsV3 = { buildEventTagsV3: buildEventTagsV3, applyToParameters: applyToParameters };
}(typeof window !== 'undefined' ? window : this));
