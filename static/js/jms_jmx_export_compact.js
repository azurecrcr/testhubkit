/**
 * JMX 导出体积优化（隔离模块，仅影响导出路径，不影响导入解析）
 */
(function (global) {
    'use strict';

    /** 仅 disabled 时输出 enabled 属性；JMeter 默认 enabled=true */
    function enabledAttr(enabled) {
        return enabled === false ? ' enabled="false"' : '';
    }

    function stringPropIf(indent, name, value, escapeXml) {
        if (value === undefined || value === null || String(value) === '') return '';
        return indent + '<stringProp name="' + name + '">' + escapeXml(String(value)) + '</stringProp>\n';
    }

    function boolPropIf(indent, name, value, defaultVal) {
        var v = value !== undefined && value !== null ? !!value : defaultVal;
        if (v === defaultVal) return '';
        return indent + '<boolProp name="' + name + '">' + (v ? 'true' : 'false') + '</boolProp>\n';
    }

    /** 步骤级 HTTP 采样器公共属性：省略空值与 JMeter 默认值 */
    function httpSamplerCommonProps(indent, opts, escapeXml) {
        opts = opts || {};
        var p = indent + '  ';
        var enc = opts.encoding !== undefined && opts.encoding !== null ? String(opts.encoding) : '';
        var multipart = !!opts.multipart;
        var xml = '';
        xml += stringPropIf(p, 'HTTPSampler.contentEncoding', enc, escapeXml);
        xml += boolPropIf(p, 'HTTPSampler.follow_redirects', opts.follow_redirects, true);
        xml += boolPropIf(p, 'HTTPSampler.auto_redirects', opts.auto_redirects, false);
        xml += boolPropIf(p, 'HTTPSampler.use_keepalive', opts.use_keepalive, true);
        if (multipart) {
            xml += p + '<boolProp name="HTTPSampler.DO_MULTIPART_POST">true</boolProp>\n';
        }
        return xml;
    }

    /** 精简 HTTP 参数块 opening tag */
    function httpArgumentsOpen(indent, testname) {
        return indent + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">\n';
    }

    /** GET/无 body 时的最小 Arguments 块 */
    function httpEmptyBodyArgs(indent) {
        var p = indent + '  ';
        return indent + '<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>\n' +
            httpArgumentsOpen(indent) +
            p + '<collectionProp name="Arguments.arguments"/>\n' +
            indent + '</elementProp>\n';
    }

    /** 表单/字段 HTTPArgument（对齐 JMeter GUI 导出，省略重复的 Argument.name） */
    function httpNamedArgument(indent, name, value, alwaysEncode, escapeXml) {
        var xml = indent + '<elementProp name="' + escapeXml(name) + '" elementType="HTTPArgument">\n';
        if (alwaysEncode) {
            xml += indent + '  <boolProp name="HTTPArgument.always_encode">true</boolProp>\n';
        }
        xml += indent + '  <stringProp name="Argument.value">' + escapeXml(value) + '</stringProp>\n';
        xml += indent + '  <stringProp name="Argument.metadata">=</stringProp>\n';
        xml += indent + '  <boolProp name="HTTPArgument.use_equals">true</boolProp>\n';
        xml += indent + '</elementProp>\n';
        return xml;
    }

    /** HTTP 请求默认值 ConfigTestElement */
    function httpDefaultsBlock(hd, pad, escapeXml) {
        if (!hd || !hd.enabled) return '';
        var p2 = pad + '  ';
        var p3 = p2 + '  ';
        var xml = pad + '<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP 请求默认值">\n';
        xml += p2 + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">\n';
        xml += p3 + '<collectionProp name="Arguments.arguments"/>\n';
        xml += p2 + '</elementProp>\n';
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
        var impl = hd.implementation || 'HttpClient4';
        if (impl && impl !== 'HttpClient4') {
            xml += p2 + '<stringProp name="HTTPSampler.implementation">' + escapeXml(impl) + '</stringProp>\n';
        }
        xml += pad + '</ConfigTestElement>\n' + pad + '<hashTree/>\n';
        return xml;
    }

    /** HeaderManager 导出 */
    function headerManagerBlock(headers, indent, testname, escapeXml, comments) {
        var xml = indent + '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="' + escapeXml(testname) + '">\n';
        if (!headers || !Object.keys(headers).length) {
            xml += indent + '  <collectionProp name="HeaderManager.headers"/>\n';
        } else {
            xml += indent + '  <collectionProp name="HeaderManager.headers">\n';
            Object.keys(headers).forEach(function (hk) {
                xml += indent + '    <elementProp name="' + escapeXml(hk) + '" elementType="Header">\n';
                xml += indent + '      <stringProp name="Header.name">' + escapeXml(hk) + '</stringProp>\n';
                xml += indent + '      <stringProp name="Header.value">' + escapeXml(headers[hk]) + '</stringProp>\n';
                xml += indent + '    </elementProp>\n';
            });
            xml += indent + '  </collectionProp>\n';
        }
        if (comments !== undefined && comments !== null && String(comments).length) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(comments)) + '</stringProp>\n';
        }
        xml += indent + '</HeaderManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }


    /** Export-only: ensure HTTPsampler.Arguments has guiclass for JMeter GUI */
    function repairMissingArgumentsGuiClass(xml) {
        if (!xml || typeof xml !== "string") return xml;
        return xml.replace(
            /<elementProp name="HTTPsampler\.Arguments" elementType="Arguments">/g,
            '<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">'
        );
    }

    /** 最终 XML 后处理：去掉冗余 enabled 与空属性行 */
    function compactExportXml(xml) {
        if (!xml || typeof xml !== 'string') return xml;
        xml = xml.replace(/ enabled="true"/g, '');
        xml = xml.replace(/^\s*<stringProp name="HTTPSampler\.(domain|port|protocol|embedded_url_re|connect_timeout|response_timeout)"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="ThreadGroup\.delay"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="filename"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="XMLAssertion\.user_defined_namespaces"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="CounterConfig\.format"><\/stringProp>\r?\n/gm, '');
        xml = repairMissingArgumentsGuiClass(xml);
        xml = xml.replace(/guiclass="RandomControllerGui"/g, 'guiclass="RandomControlGui"');
        /* 保留嵌套 elementProp 的 guiclass/testclass，避免 JMeter GUI 打开 JMX 时 guicomp 为 null */
        return xml;
    }

    global.JmsJmxExportCompact = {
        enabledAttr: enabledAttr,
        httpSamplerCommonProps: httpSamplerCommonProps,
        httpArgumentsOpen: httpArgumentsOpen,
        httpEmptyBodyArgs: httpEmptyBodyArgs,
        httpNamedArgument: httpNamedArgument,
        httpDefaultsBlock: httpDefaultsBlock,
        headerManagerBlock: headerManagerBlock,
        compactExportXml: compactExportXml
    };
})(typeof window !== 'undefined' ? window : this);
