/**
 * 线程组 HTTP 请求默认值 · 参数/消息体 JMX 与数据规范化（隔离模块）
 */
(function (global) {
    'use strict';

    function stringPropIf(indent, name, value, escapeXml) {
        if (value === undefined || value === null || String(value) === '') return '';
        return indent + '<stringProp name="' + name + '">' + escapeXml(String(value)) + '</stringProp>\n';
    }

    function boolPropIf(indent, name, value, defaultVal) {
        var v = value !== undefined && value !== null ? !!value : defaultVal;
        if (v === defaultVal) return '';
        return indent + '<boolProp name="' + name + '">' + (v ? 'true' : 'false') + '</boolProp>\n';
    }

    function normalizeParameters(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(function (row) {
            if (!row || typeof row !== 'object') {
                return { name: '', value: '', always_encode: false, use_equals: true, content_type: '' };
            }
            return {
                name: String(row.name != null ? row.name : (row.key != null ? row.key : '')),
                value: row.value == null ? '' : String(row.value),
                always_encode: !!row.always_encode,
                use_equals: row.use_equals !== false,
                content_type: row.content_type != null ? String(row.content_type) : ''
            };
        }).filter(function (row) { return String(row.name || '').trim() || String(row.value || '').trim(); });
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                var t = (nodes[i].textContent || '').trim().toLowerCase();
                return t === 'true';
            }
        }
        return def;
    }

    function parseArguments(argsEl, postBodyRaw) {
        var out = { arg_mode: 'params', parameters: [], body_data: '' };
        if (!argsEl) return out;
        var coll = argsEl.querySelector('collectionProp[name="Arguments.arguments"]');
        var argProps = coll ? coll.getElementsByTagName('elementProp') : argsEl.getElementsByTagName('elementProp');
        if (!argProps || !argProps.length) return out;

        if (postBodyRaw) {
            out.arg_mode = 'body';
            out.body_data = getStringProp(argProps[0], 'Argument.value') || '';
            return out;
        }

        var params = [];
        for (var i = 0; i < argProps.length; i++) {
            var ap = argProps[i];
            if (ap.getAttribute('elementType') !== 'HTTPArgument') continue;
            var name = getStringProp(ap, 'Argument.name') || ap.getAttribute('name') || '';
            if (name === '') name = getStringProp(ap, 'HTTPArgument.name') || '';
            params.push({
                name: name,
                value: getStringProp(ap, 'Argument.value'),
                always_encode: getBoolProp(ap, 'HTTPArgument.always_encode', false),
                use_equals: getBoolProp(ap, 'HTTPArgument.use_equals', true),
                content_type: getStringProp(ap, 'HTTPArgument.content_type') || ''
            });
        }
        out.parameters = normalizeParameters(params);
        return out;
    }

    function genArgumentsXml(d, indent, escapeXml) {
        var mode = d && d.arg_mode === 'body' ? 'body' : 'params';
        var p2 = indent + '  ';
        var p3 = p2 + '  ';
        var xml = '';

        if (mode === 'body') {
            var body = d.body_data != null ? String(d.body_data) : '';
            xml += p2 + '<boolProp name="HTTPSampler.postBodyRaw">true</boolProp>\n';
            xml += p2 + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments">\n';
            xml += p3 + '<collectionProp name="Arguments.arguments">\n';
            if (body) {
                xml += p3 + '  <elementProp name="" elementType="HTTPArgument">\n';
                xml += p3 + '    <boolProp name="HTTPArgument.always_encode">false</boolProp>\n';
                xml += p3 + '    <stringProp name="Argument.value">' + escapeXml(body) + '</stringProp>\n';
                xml += p3 + '    <stringProp name="Argument.metadata">=</stringProp>\n';
                xml += p3 + '  </elementProp>\n';
            }
            xml += p3 + '</collectionProp>\n';
            xml += p2 + '</elementProp>\n';
            return xml;
        }

        var params = normalizeParameters(d && d.parameters);
        xml += p2 + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments">\n';
        xml += p3 + '<collectionProp name="Arguments.arguments">\n';
        params.forEach(function (row) {
            var name = String(row.name || '').trim();
            if (!name) return;
            xml += p3 + '  <elementProp name="' + escapeXml(name) + '" elementType="HTTPArgument">\n';
            if (row.always_encode) {
                xml += p3 + '    <boolProp name="HTTPArgument.always_encode">true</boolProp>\n';
            }
            var ct = row.content_type != null ? String(row.content_type).trim() : '';
            if (ct) {
                xml += p3 + '    <stringProp name="HTTPArgument.content_type">' + escapeXml(ct) + '</stringProp>\n';
            }
            xml += p3 + '    <stringProp name="Argument.value">' + escapeXml(row.value || '') + '</stringProp>\n';
            xml += p3 + '    <stringProp name="Argument.metadata">=</stringProp>\n';
            if (row.use_equals === false) {
                xml += p3 + '    <boolProp name="HTTPArgument.use_equals">false</boolProp>\n';
            }
            xml += p3 + '  </elementProp>\n';
        });
        xml += p3 + '</collectionProp>\n';
        xml += p2 + '</elementProp>\n';
        return xml;
    }

    function genHttpDefaultsXml(hd, pad, escapeXml) {
        if (!hd || !hd.enabled) return '';

        var p2 = pad + '  ';
        var testname = (hd.name && String(hd.name).trim()) || 'HTTP 请求默认值';
        var xml = pad + '<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="' + escapeXml(testname) + '">\n';
        xml += genArgumentsXml(hd, p2, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.domain', hd.domain, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.port', hd.port, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.protocol', hd.protocol, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.path', hd.path !== undefined ? hd.path : '', escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.contentEncoding', hd.content_encoding, escapeXml);
        xml += boolPropIf(p2, 'HTTPSampler.follow_redirects', hd.follow_redirects, true);
        xml += boolPropIf(p2, 'HTTPSampler.auto_redirects', hd.auto_redirects, false);
        xml += boolPropIf(p2, 'HTTPSampler.use_keepalive', hd.use_keepalive, true);
        xml += stringPropIf(p2, 'HTTPSampler.connect_timeout', hd.connect_timeout, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.response_timeout', hd.response_timeout, escapeXml);
        xml += stringPropIf(p2, 'TestPlan.comments', hd.comments, escapeXml);
        var implRaw = hd.implementation;
        if (implRaw !== undefined && implRaw !== null && String(implRaw) !== '' && String(implRaw) !== 'HttpClient4') {
            xml += p2 + '<stringProp name="HTTPSampler.implementation">' + escapeXml(String(implRaw)) + '</stringProp>\n';
        }
        if (global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.genXml === 'function') {
            xml += global.JmsTgHttpDefaultsAdvanced.genXml(hd, p2, escapeXml);
        }
        xml += pad + '</ConfigTestElement>\n' + pad + '<hashTree/>\n';
        return xml;
    }

    function hasArgContent(d) {
        if (!d) return false;
        if (d.arg_mode === 'body') return String(d.body_data || '').trim() !== '';
        return normalizeParameters(d.parameters).some(function (r) { return String(r.name || '').trim(); });
    }

    global.JmsTgHttpDefaultsJmx = {
        normalizeParameters: normalizeParameters,
        parseArguments: parseArguments,
        genArgumentsXml: genArgumentsXml,
        genHttpDefaultsXml: genHttpDefaultsXml,
        hasArgContent: hasArgContent
    };
}(typeof window !== 'undefined' ? window : this));
