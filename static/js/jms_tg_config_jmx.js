/**
 * 线程组配置元件 · JMX 导出（隔离模块，config_items）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsTgConfigCatalog;

    function genCookieManagerXml(d, indent, escapeXml) {
        if (global.JmsTgCookieManagerJmx && typeof global.JmsTgCookieManagerJmx.genCookieManagerXml === 'function') {
            return global.JmsTgCookieManagerJmx.genCookieManagerXml(d, indent, escapeXml);
        }
        if (!d) return '';
        var cookies = (d.cookies || []).filter(function (c) { return c && String(c.name || '').trim(); });
        if (!cookies.length && d.clear_each_iteration !== false) return '';
        var clear = d.clear_each_iteration !== false ? 'true' : 'false';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie 管理器"' + en + '>\n';
        xml += indent + '  <collectionProp name="CookieManager.cookies">\n';
        cookies.forEach(function (c) {
            var cname = escapeXml(String(c.name));
            xml += indent + '    <elementProp name="' + cname + '" elementType="Cookie">\n';
            xml += indent + '      <stringProp name="Cookie.value">' + escapeXml(c.value || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.domain">' + escapeXml(c.domain || '') + '</stringProp>\n';
            xml += indent + '      <stringProp name="Cookie.path">' + escapeXml(c.path || '/') + '</stringProp>\n';
            xml += indent + '      <boolProp name="Cookie.secure">' + (c.secure ? 'true' : 'false') + '</boolProp>\n';
            xml += indent + '      <longProp name="Cookie.expires">' + escapeXml(c.expires || '0') + '</longProp>\n';
            xml += indent + '    </elementProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        xml += indent + '  <boolProp name="CookieManager.clearEachIteration">' + clear + '</boolProp>\n';
        xml += indent + '</CookieManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genCacheManagerXml(d, indent, escapeXml) {
        if (global.JmsTgCacheManagerJmx && typeof global.JmsTgCacheManagerJmx.genCacheManagerXml === 'function') {
            return global.JmsTgCacheManagerJmx.genCacheManagerXml(d, indent, escapeXml);
        }
        if (!d) return '';
        var clear = d.clear_each_iteration !== false ? 'true' : 'false';
        var expires = d.use_expires !== false ? 'true' : 'false';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        return indent + '<CacheManager guiclass="CacheManagerGui" testclass="CacheManager" testname="HTTP 缓存管理器"' + en + '>\n' +
            indent + '  <boolProp name="clearEachIteration">' + clear + '</boolProp>\n' +
            indent + '  <boolProp name="useExpires">' + expires + '</boolProp>\n' +
            indent + '</CacheManager>\n' + indent + '<hashTree/>\n';
    }

    function genCsvDataSetXml(d, indent, escapeXml) {
        if (global.JmsTgCsvDataSetJmx && typeof global.JmsTgCsvDataSetJmx.genCsvDataSetXml === 'function') {
            return global.JmsTgCsvDataSetJmx.genCsvDataSetXml(d, indent, escapeXml);
        }
        if (!d) return '';
        var filename = d.filename ? String(d.filename).trim() : '';
        if (!filename && !d.file_content) return '';
        if (!filename) filename = 'data/data.csv';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        var xml = indent + '<CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="CSV 数据文件设置"' + en + '>\n';
        xml += indent + '  <stringProp name="filename">' + escapeXml(filename) + '</stringProp>\n';
        xml += indent + '  <stringProp name="fileEncoding">' + escapeXml(d.file_encoding || 'UTF-8') + '</stringProp>\n';
        xml += indent + '  <stringProp name="variableNames">' + escapeXml(d.variable_names || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="ignoreFirstLine">' + (d.ignore_first_line ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <stringProp name="delimiter">' + escapeXml(d.delimiter !== undefined ? String(d.delimiter) : ',') + '</stringProp>\n';
        xml += indent + '  <boolProp name="quotedData">' + (d.quoted_data ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="recycle">' + (d.recycle !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="stopThread">' + (d.stop_thread ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <stringProp name="shareMode">' + escapeXml(d.share_mode || 'shareMode.all') + '</stringProp>\n';
        xml += indent + '</CSVDataSet>\n' + indent + '<hashTree/>\n';
        return xml;
    }

    function genCounterXml(d, indent, escapeXml) {
        if (global.JmsTgCounterJmx && typeof global.JmsTgCounterJmx.genCounterXml === 'function') {
            return global.JmsTgCounterJmx.genCounterXml(d, indent, escapeXml);
        }
        if (!d || !global.JmeterJmxExtra || typeof global.JmeterJmxExtra.genCounterXml !== 'function') return '';
        return global.JmeterJmxExtra.genCounterXml(Object.assign({}, d, { enabled: true }), indent, escapeXml);
    }

    function genSingleItemXml(item, indent, escapeXml, opts) {
        if (!Catalog || !item) return '';
        item = Catalog.normalizeItem(item);
        if (!item || !Catalog.isPersistable(item)) return '';
        opts = opts || {};
        var bu = opts.bu || {};
        var d = item.data || {};
        if (d.enabled === false) return '';
        var xml = '';
        if (item.type === 'http_defaults') {
            var hd = {
                enabled: d.enabled !== false,
                protocol: d.protocol || bu.protocol || '',
                domain: d.domain || bu.host || '',
                port: d.port || bu.port || '',
                path: d.path !== undefined ? d.path : '',
                content_encoding: d.content_encoding || '',
                follow_redirects: d.follow_redirects,
                auto_redirects: d.auto_redirects,
                use_keepalive: d.use_keepalive,
                connect_timeout: d.connect_timeout || '',
                response_timeout: d.response_timeout || '',
                implementation: d.implementation !== undefined && d.implementation !== null ? String(d.implementation) : '',
                arg_mode: d.arg_mode || 'params',
                parameters: d.parameters || [],
                body_data: d.body_data || '',
                name: d.name || '',
                comments: d.comments || ''
            };
            if (global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.normalizeAdvanced === 'function') {
                Object.assign(hd, global.JmsTgHttpDefaultsAdvanced.normalizeAdvanced(d));
            }
            if (global.JmsTgHttpDefaultsJmx && typeof global.JmsTgHttpDefaultsJmx.genHttpDefaultsXml === 'function') {
                xml += global.JmsTgHttpDefaultsJmx.genHttpDefaultsXml(hd, indent, escapeXml);
            } else if (global.JmsJmxExportCompact) {
                xml += global.JmsJmxExportCompact.httpDefaultsBlock(hd, indent, escapeXml);
            }
        } else if (item.type === 'header_manager') {
            var hdrs = Catalog.varsToObj(d.headers);
            var testname = (d.name && String(d.name).trim()) || 'HTTP 请求头管理器';
            if (global.JmsJmxExportCompact) {
                xml += global.JmsJmxExportCompact.headerManagerBlock(hdrs, indent, testname, escapeXml, d.comments);
            }
        } else if (item.type === 'auth_manager') {
            if (global.JmsTgAuthManagerJmx && typeof global.JmsTgAuthManagerJmx.genAuthManagerXml === 'function') {
                xml += global.JmsTgAuthManagerJmx.genAuthManagerXml(d, indent, escapeXml);
            }
        } else if (item.type === 'cookie_manager') {
            xml += genCookieManagerXml(d, indent, escapeXml);
        } else if (item.type === 'cache_manager') {
            xml += genCacheManagerXml(d, indent, escapeXml);
        } else if (item.type === 'csv_data_set') {
            xml += genCsvDataSetXml(d, indent, escapeXml);
        } else if (item.type === 'counter') {
            xml += genCounterXml(d, indent, escapeXml);
        }
        return xml;
    }

    function genItemsXml(items, indent, escapeXml, opts) {
        if (!Catalog || !items) return '';
        var itemList = Array.isArray(items) ? items : [];
        if (!itemList.length) return '';
        opts = opts || {};
        var xml = '';
        var hasHeader = false;
        itemList.forEach(function (raw) {
            var item = Catalog.normalizeItem(raw);
            if (!item || !Catalog.isPersistable(item)) return;
            if (item.type === 'header_manager') hasHeader = true;
            xml += genSingleItemXml(item, indent, escapeXml, opts);
        });
        var Scope = global.JmsTgJmxExportTgScope;
        if ((!Scope || typeof Scope.shouldInjectConfigItemsDefaultHeaders !== 'function' ||
                Scope.shouldInjectConfigItemsDefaultHeaders(opts.tg, itemList, opts.defaultHeaders)) &&
            !hasHeader && opts.defaultHeaders && Object.keys(opts.defaultHeaders).length) {
            if (global.JmsJmxExportCompact) {
                xml += global.JmsJmxExportCompact.headerManagerBlock(opts.defaultHeaders, indent, '默认请求头', escapeXml);
            }
        }
        return xml;
    }

    global.JmsTgConfigJmx = {
        genItemsXml: genItemsXml,
        genSingleItemXml: genSingleItemXml
    };
}(typeof window !== 'undefined' ? window : this));
