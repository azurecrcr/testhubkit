/**
 * 线程组 HTTP 缓存管理器 · 数据规范化与 JMX（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULT_MAX_SIZE = '5000';

    function normalizeMaxSize(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (!v) return DEFAULT_MAX_SIZE;
        var n = parseInt(v, 10);
        if (!isFinite(n) || n < 1) return DEFAULT_MAX_SIZE;
        return String(n);
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                return (nodes[i].textContent || '').trim().toLowerCase() === 'true';
            }
        }
        return def;
    }

    function getIntProp(el, name, def) {
        if (!el) return def;
        var tags = ['intProp', 'longProp', 'stringProp'];
        for (var t = 0; t < tags.length; t++) {
            var nodes = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].getAttribute('name') === name) {
                    var v = (nodes[i].textContent || '').trim();
                    if (v !== '') return v;
                }
            }
        }
        return def;
    }

    function parseFromEl(el, testname) {
        return {
            name: testname || '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            clear_each_iteration: getBoolProp(el, 'clearEachIteration', false),
            use_expires: getBoolProp(el, 'useExpires', true),
            max_size: normalizeMaxSize(getIntProp(el, 'maxSize', DEFAULT_MAX_SIZE))
        };
    }

    function hasNonDefaultOptions(d) {
        if (!d) return false;
        if (d.clear_each_iteration === true) return true;
        if (d.use_expires === false) return true;
        return normalizeMaxSize(d.max_size) !== DEFAULT_MAX_SIZE;
    }

    function hasContent(d) {
        if (!d) return false;
        if (String(d.name || '').trim() || String(d.comments || '').trim()) return true;
        return hasNonDefaultOptions(d);
    }

    function genCacheManagerXml(d, indent, escapeXml) {
        if (!d) return '';
        var clear = d.clear_each_iteration === true ? 'true' : 'false';
        var expires = d.use_expires !== false ? 'true' : 'false';
        var maxSize = normalizeMaxSize(d.max_size);
        var testname = (d.name && String(d.name).trim()) || 'HTTP 缓存管理器';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CacheManager guiclass="CacheManagerGui" testclass="CacheManager" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <boolProp name="clearEachIteration">' + clear + '</boolProp>\n';
        xml += indent + '  <boolProp name="useExpires">' + expires + '</boolProp>\n';
        if (maxSize !== DEFAULT_MAX_SIZE) {
            xml += indent + '  <intProp name="maxSize">' + escapeXml(maxSize) + '</intProp>\n';
        }
        xml += indent + '</CacheManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsTgCacheManagerJmx = {
        DEFAULT_MAX_SIZE: DEFAULT_MAX_SIZE,
        normalizeMaxSize: normalizeMaxSize,
        parseFromEl: parseFromEl,
        hasContent: hasContent,
        genCacheManagerXml: genCacheManagerXml
    };
}(typeof window !== 'undefined' ? window : this));
