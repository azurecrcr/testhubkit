/**
 * 树形视图 · 线程组配置元件下拉菜单（隔离模块，仅 lth-tg-view-tree）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsTgConfigCatalog;

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function closePeerMenus() {
        global.document.querySelectorAll(
            '.jms-tg-listener-more.is-open, .jms-tg-logic-ctrl-more.is-open, .jms-tg-post-proc-more.is-open,' +
            ' .jms-http-ctx-listener-more.is-open, .jms-http-ctx-preproc-more.is-open,' +
            ' .jms-http-ctx-proc-more.is-open, .jms-http-ctx-timer-more.is-open,' +
            ' .jms-http-ctx-config-more.is-open, .lth-tg-add-more.is-open, .jms-tg-sampler-more.is-open'
        ).forEach(function (el) {
            el.classList.remove('is-open');
            var tr = el.querySelector(
                '.jms-tg-listener-menu-trigger, .jms-tg-logic-ctrl-trigger,' +
                ' .jms-tg-post-proc-trigger, .jms-tg-sampler-trigger'
            );
            if (tr) tr.setAttribute('aria-expanded', 'false');
        });
    }

    function closeMenus(except) {
        global.document.querySelectorAll('.jms-tg-config-more.is-open').forEach(function (el) {
            if (el !== except) {
                el.classList.remove('is-open');
                var tr = el.querySelector('.jms-tg-config-trigger');
                if (tr) tr.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function closeAllMenus() {
        closeMenus(null);
    }

    function renderMenu(tg, planId) {
        var cfgOn = Catalog && typeof Catalog.anyItems === 'function' ? Catalog.anyItems(tg) : false;
        var keys = Catalog && Catalog.CONFIG_KEYS ? Catalog.CONFIG_KEYS : [
            'http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'
        ];
        var labels = Catalog && Catalog.LABELS ? Catalog.LABELS : {
            http_defaults: 'HTTP 请求默认值',
            header_manager: 'HTTP 请求头管理器',
            auth_manager: 'HTTP 授权管理器',
            cookie_manager: 'HTTP Cookie 管理器',
            cache_manager: 'HTTP 缓存管理器',
            csv_data_set: 'CSV 数据文件设置',
            counter: '计数器'
        };
        var items = '';
        return '<div class="jms-tg-config-more" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<button type="button" class="jms-tg-config-trigger jms-tg-tree-btn-ghost' + (cfgOn ? ' is-on' : '') + '" title="配置元件" aria-haspopup="true" aria-expanded="false">' +
            '配置元件<span class="jms-tg-config-caret" aria-hidden="true">▾</span></button>' +
            '<div class="jms-tg-config-menu" role="menu">' + items + '</div></div>';
    }

    function onDocumentClick(ev) {
        if (!isTreeView()) return;
        if (global.document.body.classList.contains('lth-jmeter-catalog-v2')) return;
        var t = ev.target;

        if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.closePopup === 'function') {
            global.JmsCatalogMenuV2.closePopup();
        }

        var trigger = t.closest('.jms-tg-config-trigger');
        if (trigger) {
            ev.preventDefault();
            ev.stopPropagation();
            if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.closePopup === 'function') {
                global.JmsCatalogMenuV2.closePopup();
            }
            if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.closeAllNativeTgMenus === 'function') {
                global.JmsCatalogMenuV2.closeAllNativeTgMenus();
            }
            var wrap = trigger.closest('.jms-tg-config-more');
            if (!wrap) return;
            var open = wrap.classList.contains('is-open');
            closePeerMenus();
            closeMenus(wrap);
            wrap.classList.toggle('is-open', !open);
            trigger.setAttribute('aria-expanded', !open ? 'true' : 'false');
            return;
        }

        var menuItem = t.closest('.jms-tg-config-menu-item');
        if (menuItem) {
            ev.preventDefault();
            ev.stopPropagation();
            var w = menuItem.closest('.jms-tg-config-more');
            if (!w) return;
            var planId = w.getAttribute('data-plan-id');
            var tgId = w.getAttribute('data-tg-id');
            var typeKey = menuItem.getAttribute('data-config-type');
            closeAllMenus();
            if (planId && tgId && typeKey && global.JmsTgConfigUi && typeof global.JmsTgConfigUi.openDrawer === 'function') {
                global.JmsTgConfigUi.openDrawer(planId, tgId, typeKey);
            }
            return;
        }

        if (!t.closest('.jms-tg-config-more')) closeAllMenus();
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsTgConfigMenuBound === '1') return;
        global.document.body.dataset.jmsTgConfigMenuBound = '1';
        global.document.addEventListener('click', onDocumentClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgConfigMenuUi = { renderMenu: renderMenu, closeAllMenus: closeAllMenus };
})(window);
