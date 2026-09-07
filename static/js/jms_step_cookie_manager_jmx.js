/**
 * HTTP 步骤配置元件 · HTTP Cookie 管理器 · 数据规范化与 JMX（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULT_POLICY = 'standard';

    var POLICY_OPTIONS = [
        { value: 'standard', label: 'standard' },
        { value: 'standard-strict', label: 'standard-strict' },
        { value: 'ignoreCookies', label: 'ignoreCookies' },
        { value: 'netscape', label: 'netscape' },
        { value: 'default', label: 'default' },
        { value: 'rfc2109', label: 'rfc2109' },
        { value: 'rfc2965', label: 'rfc2965' },
        { value: 'best-match', label: 'best-match' },
        { value: 'compatibility', label: 'compatibility' }
    ];

    var POLICY_VALUES = POLICY_OPTIONS.map(function (o) { return o.value; });

    function normalizeCookiePolicy(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (!v) return DEFAULT_POLICY;
        if (POLICY_VALUES.indexOf(v) >= 0) return v;
        if (v === 'compatbility') return 'compatibility';
        return DEFAULT_POLICY;
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

    function getLongProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('longProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return def;
    }

    function parseCookiesFromEl(el) {
        var cookies = [];
        if (!el) return cookies;
        var coll = el.querySelector('collectionProp[name="CookieManager.cookies"]');
        if (!coll) return cookies;
        var props = coll.getElementsByTagName('elementProp');
        for (var i = 0; i < props.length; i++) {
            var cp = props[i];
            if (cp.getAttribute('elementType') !== 'Cookie') continue;
            var name = (cp.getAttribute('name') || getStringProp(cp, 'Cookie.name') || '').trim();
            if (!name) continue;
            cookies.push({
                name: name,
                value: getStringProp(cp, 'Cookie.value') || '',
                domain: getStringProp(cp, 'Cookie.domain') || '',
                path: getStringProp(cp, 'Cookie.path') || '/',
                secure: getBoolProp(cp, 'Cookie.secure', false),
                expires: getLongProp(cp, 'Cookie.expires', '0')
            });
        }
        return cookies;
    }

    function parseFromEl(el, testname) {
        return {
            name: testname || '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            clear_each_iteration: getBoolProp(el, 'CookieManager.clearEachIteration', true),
            cookie_policy: normalizeCookiePolicy(getStringProp(el, 'CookieManager.cookiePolicy')),
            cookies: parseCookiesFromEl(el)
        };
    }

    function hasNonDefaultOptions(d) {
        if (!d) return false;
        if (d.clear_each_iteration === false) return true;
        return normalizeCookiePolicy(d.cookie_policy) !== DEFAULT_POLICY;
    }

    function hasContent(d) {
        if (!d) return false;
        if ((d.cookies || []).some(function (c) { return c && String(c.name || '').trim(); })) return true;
        if (String(d.name || '').trim() || String(d.comments || '').trim()) return true;
        return hasNonDefaultOptions(d);
    }

    function shouldExport(d) {
        if (!d) return false;
        return hasContent(d);
    }

    function genCookieManagerXml(d, indent, escapeXml) {
        if (!d || !shouldExport(d)) return '';
        var cookies = (d.cookies || []).filter(function (c) { return c && String(c.name || '').trim(); });
        var clear = d.clear_each_iteration !== false ? 'true' : 'false';
        var policy = normalizeCookiePolicy(d.cookie_policy);
        var testname = (d.name && String(d.name).trim()) || 'HTTP Cookie 管理器';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="CookieManager.cookies">\n';
        cookies.forEach(function (c) {
            var cname = escapeXml(String(c.name));
            xml += indent + '    <elementProp name="' + cname + '" elementType="Cookie">\n';
            xml += indent + '      <stringProp name="Cookie.name">' + cname + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.value">' + escapeXml(c.value || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.domain">' + escapeXml(c.domain || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.path">' + escapeXml(c.path || '/') + '</stringProp>\n';
            xml += indent + '      <boolProp name="Cookie.secure">' + (c.secure ? 'true' : 'false') + '</boolProp>\n';
            xml += indent + '      <longProp name="Cookie.expires">' + escapeXml(c.expires || '0') + '</longProp>\n';
            xml += indent + '    </elementProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        xml += indent + '  <boolProp name="CookieManager.clearEachIteration">' + clear + '</boolProp>\n';
        if (policy !== DEFAULT_POLICY) {
            xml += indent + '  <stringProp name="CookieManager.cookiePolicy">' + escapeXml(policy) + '</stringProp>\n';
        }
        xml += indent + '</CookieManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsStepCookieManagerJmx = {
        DEFAULT_POLICY: DEFAULT_POLICY,
        POLICY_OPTIONS: POLICY_OPTIONS,
        normalizeCookiePolicy: normalizeCookiePolicy,
        parseFromEl: parseFromEl,
        hasContent: hasContent,
        genCookieManagerXml: genCookieManagerXml
    };
}(typeof window !== 'undefined' ? window : this));
