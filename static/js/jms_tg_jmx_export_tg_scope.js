/**
 * JMX ?? ? ???????/HTTP??? ???????????
 * ???????????????????????????????
 */
(function (global) {
    'use strict';

    function isConfigTimelineActive(tg) {
        return !!(tg && (tg.config_timeline_active || tg._config_timeline_active));
    }

    function hasHttpDefaultsConfigItem(tg) {
        if (!tg || !Array.isArray(tg.config_items)) return false;
        return tg.config_items.some(function (it) {
            if (!it || it.type !== 'http_defaults' || it._deleted) return false;
            var d = it.data || {};
            return d.enabled !== false;
        });
    }

    function hasText(v) {
        return v !== undefined && v !== null && String(v).trim() !== '';
    }

    function hasExplicitHttpDefaultsContent(hd) {
        if (!hd || typeof hd !== 'object') return false;
        return hasText(hd.protocol) || hasText(hd.domain) || hasText(hd.port) || hasText(hd.path) ||
            hasText(hd.connect_timeout) || hasText(hd.response_timeout) || hasText(hd.content_encoding) ||
            (hasText(hd.implementation) && String(hd.implementation) !== 'HttpClient4') ||
            hd.auto_redirects === true || hd.follow_redirects === false || hd.use_keepalive === false;
    }

    function isHttpDefaultsSelected(httpMgr) {
        if (!httpMgr || !httpMgr.http_defaults) return false;
        var hd = httpMgr.http_defaults;
        if (hd.enabled === false) return false;
        var sel = httpMgr.selected_types;
        if (Array.isArray(sel) && sel.length) {
            return sel.indexOf('http_defaults') >= 0;
        }
        return hd.enabled === true;
    }

    /** ??? legacy http_managers ?????? HTTP ????? */
    function shouldExportLegacyHttpDefaults(httpMgr, tg) {
        if (!httpMgr || !httpMgr.http_defaults) return false;
        if (isConfigTimelineActive(tg) && !hasHttpDefaultsConfigItem(tg)) return false;
        if (!isHttpDefaultsSelected(httpMgr)) return false;
        return hasExplicitHttpDefaultsContent(httpMgr.http_defaults);
    }

    function planHeadersUsable(defaultHeaders) {
        return !!(defaultHeaders && typeof defaultHeaders === 'object' && Object.keys(defaultHeaders).length);
    }

    function tgHasExplicitHeaderManager(tg, httpMgr) {
        if (!tg) return false;
        var Catalog = global.JmsTgConfigCatalog;
        if (Catalog && typeof Catalog.ensureConfigItems === 'function') {
            var items = Catalog.ensureConfigItems(tg);
            var i;
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                if (it && it.type === 'header_manager' && Catalog.isPersistable && Catalog.isPersistable(it)) return true;
            }
        }
        var hm = (httpMgr && httpMgr.header_manager) || (tg.http_managers && tg.http_managers.header_manager);
        if (!hm || hm.enabled === false) return false;
        var selected = (httpMgr && httpMgr.selected_types) || (tg.http_managers && tg.http_managers.selected_types);
        if (Array.isArray(selected) && selected.length) {
            return selected.indexOf('header_manager') >= 0;
        }
        return true;
    }

    /** 线程组未单独配置 HeaderManager 时，继承计划级 catalog 公共请求头 */
    function shouldInjectThreadGroupDefaultHeaders(tg, httpMgr, defaultHeaders) {
        if (!planHeadersUsable(defaultHeaders)) return false;
        return !tgHasExplicitHeaderManager(tg, httpMgr);
    }

    /** config_items 导出路径：同上 */
    function shouldInjectConfigItemsDefaultHeaders(tg, items, defaultHeaders) {
        if (!planHeadersUsable(defaultHeaders)) return false;
        var hasHeader = false;
        (items || []).forEach(function (it) {
            if (it && it.type === 'header_manager') hasHeader = true;
        });
        return !hasHeader;
    }

    global.JmsTgJmxExportTgScope = {
        shouldExportLegacyHttpDefaults: shouldExportLegacyHttpDefaults,
        shouldInjectThreadGroupDefaultHeaders: shouldInjectThreadGroupDefaultHeaders,
        shouldInjectConfigItemsDefaultHeaders: shouldInjectConfigItemsDefaultHeaders,
        isConfigTimelineActive: isConfigTimelineActive,
        hasHttpDefaultsConfigItem: hasHttpDefaultsConfigItem
    };
}(typeof window !== 'undefined' ? window : this));
