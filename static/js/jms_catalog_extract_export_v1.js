/**
 * catalog HTTP 提取器双通道导出（主 extract + extractors[]，隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        return String(s == null ? '' : s);
    }

    function genJsonExtractXml(ex, childPad, escapeXml) {
        if (!ex || !ex.var || !ex.json_path) return '';
        var xml = '';
        xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
            escapeXml(ex.var) + '" enabled="true">\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(ex.var) + '</stringProp>\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(ex.json_path) + '</stringProp>\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
        xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
        xml += childPad + '</JSONPostProcessor>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    function prepareFlatForGenSingleHttp(flat) {
        var out = flat;
        if (!out || typeof out !== 'object') return out;
        out.extractors = [];
        return out;
    }

    function injectExtractorsIntoSamplerXml(samplerXml, flat, indent, helpers) {
        if (!samplerXml || !flat) return samplerXml;
        var extractors = flat.extractors;
        if (!extractors || !extractors.length) return samplerXml;
        var escapeXml = function (s) { return esc(s, helpers); };
        var childPad = indent + '  ';
        var extra = '';
        extractors.forEach(function (ex) {
            extra += genJsonExtractXml(ex, childPad, escapeXml);
        });
        if (!extra) return samplerXml;
        var close = indent + '</hashTree>\n';
        var idx = samplerXml.lastIndexOf(close);
        if (idx >= 0) {
            return samplerXml.slice(0, idx) + extra + samplerXml.slice(idx);
        }
        var emptyTag = indent + '<hashTree/>\n';
        if (samplerXml.indexOf(emptyTag) >= 0) {
            return samplerXml.replace(emptyTag, indent + '<hashTree>\n' + extra + close);
        }
        return samplerXml + extra;
    }

    global.JmsCatalogExtractExportV1 = {
        genJsonExtractXml: genJsonExtractXml,
        prepareFlatForGenSingleHttp: prepareFlatForGenSingleHttp,
        injectExtractorsIntoSamplerXml: injectExtractorsIntoSamplerXml
    };
})(typeof window !== 'undefined' ? window : this);
