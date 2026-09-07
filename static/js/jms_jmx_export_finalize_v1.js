/**
 * JMX 导出 XML 终态修正 V1（export-only）
 */
(function (global) {
    'use strict';
    function removeStandalonePlanArguments(xml) {
        var out = xml;
        out = out.replace(/<Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="计划变量"[^>]*>[\s\S]*?<\/Arguments>\s*<hashTree\/>/g, '');
        out = out.replace(/<Arguments[^>]*testname="计划变量"[^>]*\/>/g, '');
        out = out.replace(/<Arguments[^>]*testname="计划变量"[^>]*>\s*<\/Arguments>/g, '');
        return out;
    }
    function removeEmptyHttpDefaults(xml) {
        return xml.replace(/<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP 请求默认值">[\s\S]*?<elementProp name="HTTPsampler.Arguments"[\s\S]*?<\/elementProp>\s*<\/ConfigTestElement>\s*<hashTree\/>/g, function (block) {
            if (/HTTPSampler\.(domain|port|protocol)/.test(block)) return block;
            return '';
        });
    }
    function fixBuildId(xml, data) {
        if (!data || !data.build || String(data.build).indexOf('${') < 0) return xml;
        return xml.replace(/(<stringProp name="Argument.name">BUILD_ID<\/stringProp>\s*<stringProp name="Argument.value">)local-build(<\/stringProp>)/g, '$1${BUILD_ID}$2');
    }
    function unifyEventTags(xml) {
        var ET = global.JmsBackendListenerEventTagsV3;
        if (!ET || !ET.buildEventTagsV3) return xml;
        var root = global.__jmxExportRootData || {};
        var val = ET.buildEventTagsV3({}, root);
        return xml.replace(/(<stringProp name="Argument.name">eventTags<\/stringProp>\s*<stringProp name="Argument.value">)[^<]*(<\/stringProp>)/g, '$1' + val + '$2');
    }
    function finalizeExportXml(xml, data) {
        if (!xml) return xml;
        var log = [];
        var out = xml;
        var before = out;
        out = removeStandalonePlanArguments(out);
        if (out !== before) log.push('removed_plan_args');
        before = out;
        out = removeEmptyHttpDefaults(out);
        if (out !== before) log.push('removed_empty_http_defaults');
        out = fixBuildId(out, data);
        out = unifyEventTags(out);
        if (global.JmsJmxExportCompact && typeof global.JmsJmxExportCompact.compactExportXml === 'function') out = global.JmsJmxExportCompact.compactExportXml(out);
        global.__jmxExportFinalizeLog = log;
        return out;
    }
    global.JmsJmxExportFinalizeV1 = { finalizeExportXml: finalizeExportXml };
}(typeof window !== 'undefined' ? window : this));
