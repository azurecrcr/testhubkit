/**
 * 线程组配置元件 · HTTP 缓存管理器弹窗 UI（隔离模块，仅 modal-tg-config-drawer-cache-manager）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-config-drawer-cache-manager';
    var UI_VERSION = '2';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getCatalog() {
        return global.JmsTgConfigCatalog;
    }

    function defaultData() {
        var Catalog = getCatalog();
        return Catalog ? Catalog.defaultItemData('cache_manager') : {
            name: '', comments: '', clear_each_iteration: false, use_expires: true, max_size: '5000'
        };
    }

    function normalizeMaxSize(val) {
        if (global.JmsTgCacheManagerJmx && typeof global.JmsTgCacheManagerJmx.normalizeMaxSize === 'function') {
            return global.JmsTgCacheManagerJmx.normalizeMaxSize(val);
        }
        return val ? String(val) : '5000';
    }

    function cacheTextField(label, fieldName, value, placeholder, width) {
        return '<label class="jms-tg-cache-v2__field jms-tg-cache-v2__field--' + width + '">' +
            '<span class="jms-tg-cache-v2__label">' + esc(label) + '</span>' +
            '<input type="text" class="hf-mono jms-tg-cache-v2__input" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
            '</label>';
    }

    function renderOptionsCard(d) {
        return '<section class="jms-tg-cache-v2__card jms-tg-cache-v2__card--options">' +
            '<div class="jms-tg-cache-v2__options-grid">' +
            '<span class="jms-tg-cache-v2__card-title">缓存选项</span>' +
            '<label class="jms-tg-cache-v2__chk-row">' +
            '<input type="checkbox" data-cfg-field="clear_each_iteration"' + (d.clear_each_iteration === true ? ' checked' : '') + '>' +
            '<span>每次迭代清除缓存</span></label>' +
            '<label class="jms-tg-cache-v2__chk-row jms-tg-cache-v2__chk-row--expires">' +
            '<input type="checkbox" data-cfg-field="use_expires"' + (d.use_expires !== false ? ' checked' : '') + '>' +
            '<span>使用 Cache-Control / Expires 头</span></label>' +
            '<label class="jms-tg-cache-v2__field jms-tg-cache-v2__field--max-size">' +
            '<span class="jms-tg-cache-v2__label">最大元素数</span>' +
            '<input type="number" min="1" step="1" class="hf-mono jms-tg-cache-v2__input jms-tg-cache-v2__input--number" data-cfg-field="max_size" value="' + esc(normalizeMaxSize(d.max_size)) + '" placeholder="5000" aria-label="缓存最大元素数">' +
            '</label>' +
            '</div></section>';
    }

    function renderCacheManagerBody(item) {
        var d = (item && item.data) || defaultData();
        if (item && item.name && !d.name) d.name = item.name;
        return '<div class="jms-tg-cache-v2" data-cache-ui-version="' + UI_VERSION + '">' +
            '<section class="jms-tg-cache-v2__card jms-tg-cache-v2__card--meta">' +
            '<div class="jms-tg-cache-v2__meta-row">' +
            cacheTextField('名称', 'name', d.name, 'HTTP 缓存管理器', 'name') +
            cacheTextField('注释', 'comments', d.comments, '可选', 'comments') +
            '</div></section>' +
            renderOptionsCard(d) +
            '</div>';
    }

    function readCacheManagerFromBody(body, priorData) {
        var out = defaultData();
        if (priorData && typeof priorData === 'object') {
            Object.keys(out).forEach(function (k) {
                if (priorData[k] !== undefined) out[k] = priorData[k];
            });
        }
        if (!body) return out;
        var nameEl = body.querySelector('[data-cfg-field="name"]');
        var commentsEl = body.querySelector('[data-cfg-field="comments"]');
        out.name = nameEl ? nameEl.value.trim() : '';
        out.comments = commentsEl ? commentsEl.value : '';
        out.clear_each_iteration = !!((body.querySelector('[data-cfg-field="clear_each_iteration"]') || {}).checked);
        out.use_expires = !!((body.querySelector('[data-cfg-field="use_expires"]') || {}).checked);
        var maxEl = body.querySelector('[data-cfg-field="max_size"]');
        out.max_size = normalizeMaxSize(maxEl ? maxEl.value : out.max_size);
        return out;
    }

    function bind() {
        if (global.document.body.dataset.jmsTgCacheV2Bound === '1') return;
        global.document.body.dataset.jmsTgCacheV2Bound = '1';
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgCacheManagerUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        renderCacheManagerBody: renderCacheManagerBody,
        readCacheManagerFromBody: readCacheManagerFromBody,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
