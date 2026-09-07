/**
 * 线程组 HTTP 请求默认值 · 高级 Tab 字段（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        image_parser: false,
        concurrent_dwn: false,
        concurrent_pool: '6',
        embedded_url_re: '',
        ip_source_type: '0',
        ip_source: '',
        proxy_host: '',
        proxy_port: '',
        proxy_user: '',
        proxy_pass: '',
        md5: false
    };

    function stringPropIf(indent, name, value, escapeXml) {
        if (value === undefined || value === null || String(value) === '') return '';
        return indent + '<stringProp name="' + name + '">' + escapeXml(String(value)) + '</stringProp>\n';
    }

    function boolPropIf(indent, name, value, defaultVal) {
        var v = value !== undefined && value !== null ? !!value : defaultVal;
        if (v === defaultVal) return '';
        return indent + '<boolProp name="' + name + '">' + (v ? 'true' : 'false') + '</boolProp>\n';
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

    function normalizeAdvanced(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        var out = {};
        Object.keys(DEFAULTS).forEach(function (k) {
            var def = DEFAULTS[k];
            if (typeof def === 'boolean') out[k] = raw[k] === true;
            else if (k === 'concurrent_pool') {
                var pool = raw.concurrent_pool != null ? String(raw.concurrent_pool).trim() : '';
                out.concurrent_pool = pool || DEFAULTS.concurrent_pool;
            } else if (k === 'ip_source_type') {
                var t = raw.ip_source_type != null ? String(raw.ip_source_type).trim() : '';
                out.ip_source_type = t === '' ? DEFAULTS.ip_source_type : t;
            } else out[k] = raw[k] != null ? String(raw[k]) : '';
        });
        return out;
    }

    function parseFromEl(el) {
        if (!el) return normalizeAdvanced({});
        return normalizeAdvanced({
            image_parser: getBoolProp(el, 'HTTPSampler.image_parser', false),
            concurrent_dwn: getBoolProp(el, 'HTTPSampler.concurrentDwn', false),
            concurrent_pool: getStringProp(el, 'HTTPSampler.concurrentPool') || DEFAULTS.concurrent_pool,
            embedded_url_re: getStringProp(el, 'HTTPSampler.embedded_url_re'),
            ip_source_type: getStringProp(el, 'HTTPSampler.ipSourceType') || DEFAULTS.ip_source_type,
            ip_source: getStringProp(el, 'HTTPSampler.ipSource'),
            proxy_host: getStringProp(el, 'HTTPSampler.proxyHost'),
            proxy_port: getStringProp(el, 'HTTPSampler.proxyPort'),
            proxy_user: getStringProp(el, 'HTTPSampler.proxyUser'),
            proxy_pass: getStringProp(el, 'HTTPSampler.proxyPass'),
            md5: getBoolProp(el, 'HTTPSampler.md5', false)
        });
    }

    function genXml(hd, indent, escapeXml) {
        if (!hd) return '';
        var d = normalizeAdvanced(hd);
        var xml = '';
        xml += boolPropIf(indent, 'HTTPSampler.image_parser', d.image_parser, false);
        xml += boolPropIf(indent, 'HTTPSampler.concurrentDwn', d.concurrent_dwn, false);
        if (d.concurrent_dwn) {
            xml += stringPropIf(indent, 'HTTPSampler.concurrentPool', d.concurrent_pool || DEFAULTS.concurrent_pool, escapeXml);
        }
        xml += stringPropIf(indent, 'HTTPSampler.embedded_url_re', d.embedded_url_re, escapeXml);
        if (d.ip_source_type && d.ip_source_type !== DEFAULTS.ip_source_type) {
            xml += stringPropIf(indent, 'HTTPSampler.ipSourceType', d.ip_source_type, escapeXml);
        }
        xml += stringPropIf(indent, 'HTTPSampler.ipSource', d.ip_source, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyHost', d.proxy_host, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyPort', d.proxy_port, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyUser', d.proxy_user, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyPass', d.proxy_pass, escapeXml);
        xml += boolPropIf(indent, 'HTTPSampler.md5', d.md5, false);
        return xml;
    }

    function hasContent(d) {
        if (!d) return false;
        var n = normalizeAdvanced(d);
        return n.image_parser || n.concurrent_dwn || n.md5 ||
            String(n.embedded_url_re || '').trim() !== '' ||
            String(n.ip_source || '').trim() !== '' ||
            (n.ip_source_type && n.ip_source_type !== DEFAULTS.ip_source_type) ||
            String(n.proxy_host || '').trim() !== '' ||
            String(n.proxy_port || '').trim() !== '' ||
            String(n.proxy_user || '').trim() !== '' ||
            String(n.proxy_pass || '').trim() !== '';
    }

    global.JmsTgHttpDefaultsAdvanced = {
        DEFAULTS: DEFAULTS,
        normalizeAdvanced: normalizeAdvanced,
        parseFromEl: parseFromEl,
        genXml: genXml,
        hasContent: hasContent
    };
}(typeof window !== 'undefined' ? window : this));
