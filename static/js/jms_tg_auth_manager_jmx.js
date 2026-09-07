/**
 * 线程组 HTTP 授权管理器 · 数据规范化与 JMX（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULT_MECHANISM = 'BASIC_DIGEST';

    var MECHANISM_OPTIONS = [
        { value: 'BASIC_DIGEST', label: 'BASIC_DIGEST' },
        { value: 'BASIC', label: 'BASIC' },
        { value: 'DIGEST', label: 'DIGEST' },
        { value: 'KERBEROS', label: 'KERBEROS' }
    ];

    var MECHANISM_VALUES = MECHANISM_OPTIONS.map(function (o) { return o.value; });

    function normalizeMechanism(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (!v) return DEFAULT_MECHANISM;
        if (MECHANISM_VALUES.indexOf(v) >= 0) return v;
        if (v.toUpperCase() === 'BASIC_DIGEST') return 'BASIC_DIGEST';
        return DEFAULT_MECHANISM;
    }

    function normalizeAuthorizations(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(function (row) {
            if (!row || typeof row !== 'object') {
                return { url: '', username: '', password: '', domain: '', realm: '', mechanism: DEFAULT_MECHANISM };
            }
            return {
                url: row.url != null ? String(row.url) : '',
                username: row.username != null ? String(row.username) : '',
                password: row.password != null ? String(row.password) : '',
                domain: row.domain != null ? String(row.domain) : '',
                realm: row.realm != null ? String(row.realm) : '',
                mechanism: normalizeMechanism(row.mechanism)
            };
        });
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

    function parseAuthRowFromEl(rowEl) {
        return {
            url: getStringProp(rowEl, 'Authorization.url'),
            username: getStringProp(rowEl, 'Authorization.username'),
            password: getStringProp(rowEl, 'Authorization.password'),
            domain: getStringProp(rowEl, 'Authorization.domain'),
            realm: getStringProp(rowEl, 'Authorization.realm'),
            mechanism: normalizeMechanism(getStringProp(rowEl, 'Authorization.mechanism'))
        };
    }

    function parseAuthListFromEl(el) {
        if (!el) return [];
        var out = [];
        var coll = el.querySelector('collectionProp[name="AuthManager.auth_list"]');
        if (!coll) return out;
        var rows = coll.querySelectorAll('elementProp[elementType="Authorization"]');
        for (var i = 0; i < rows.length; i++) {
            var row = parseAuthRowFromEl(rows[i]);
            if (row.url || row.username || row.password || row.domain || row.realm) out.push(row);
        }
        return out;
    }

    function parseFromEl(el, testname) {
        return {
            name: testname || '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            clear_each_iteration: getBoolProp(el, 'AuthManager.clearEachIteration', false),
            authorizations: parseAuthListFromEl(el)
        };
    }

    function hasContent(d) {
        if (!d) return false;
        if (String(d.name || '').trim() || String(d.comments || '').trim()) return true;
        if (d.clear_each_iteration === true) return true;
        return (d.authorizations || []).some(function (row) {
            return row && (String(row.url || '').trim() || String(row.username || '').trim() ||
                String(row.password || '').trim() || String(row.domain || '').trim() || String(row.realm || '').trim());
        });
    }

    function shouldExport(d) {
        return hasContent(d);
    }

    function genAuthManagerXml(d, indent, escapeXml) {
        if (!d || !shouldExport(d)) return '';
        var rows = (d.authorizations || []).filter(function (row) {
            return row && (String(row.url || '').trim() || String(row.username || '').trim() ||
                String(row.password || '').trim() || String(row.domain || '').trim() || String(row.realm || '').trim());
        });
        if (!rows.length && d.clear_each_iteration !== true && !String(d.name || '').trim()) return '';
        var testname = (d.name && String(d.name).trim()) || 'HTTP 授权管理器';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<AuthManager guiclass="AuthPanel" testclass="AuthManager" testname="' + escapeXml(testname) + '"' + en + '>\n';
        if (d.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(d.comments)) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="AuthManager.auth_list">\n';
        rows.forEach(function (row, idx) {
            xml += indent + '    <elementProp name="' + escapeXml(String(idx)) + '" elementType="Authorization">\n';
            xml += indent + '      <stringProp name="Authorization.url">' + escapeXml(row.url || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.username">' + escapeXml(row.username || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.password">' + escapeXml(row.password || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.domain">' + escapeXml(row.domain || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.realm">' + escapeXml(row.realm || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Authorization.mechanism">' + escapeXml(normalizeMechanism(row.mechanism)) + '</stringProp>\n';
            xml += indent + '    </elementProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        xml += indent + '  <boolProp name="AuthManager.clearEachIteration">' + (d.clear_each_iteration === true ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</AuthManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsTgAuthManagerJmx = {
        DEFAULT_MECHANISM: DEFAULT_MECHANISM,
        MECHANISM_OPTIONS: MECHANISM_OPTIONS,
        normalizeMechanism: normalizeMechanism,
        normalizeAuthorizations: normalizeAuthorizations,
        parseFromEl: parseFromEl,
        hasContent: hasContent,
        genAuthManagerXml: genAuthManagerXml
    };
}(typeof window !== 'undefined' ? window : this));
