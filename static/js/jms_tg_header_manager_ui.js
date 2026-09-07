/**
 * 线程组配置元件 · HTTP 信息头管理器弹窗 UI（隔离模块，仅 modal-tg-config-drawer-header-manager）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-config-drawer-header-manager';
    var UI_VERSION = '1';

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
        return Catalog ? Catalog.defaultItemData('header_manager') : { name: '', comments: '', headers: [] };
    }

    function normalizeHeaders(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.filter(function (r) { return r && String(r.key || '').trim(); }).map(function (r) {
            return { key: String(r.key).trim(), value: r.value == null ? '' : String(r.value) };
        });
    }

    function emptyHeaderRow() {
        return { key: '', value: '' };
    }

    function hmTextField(label, fieldName, value, placeholder, width) {
        return '<label class="jms-tg-hm-v2__field jms-tg-hm-v2__field--' + width + '">' +
            '<span class="jms-tg-hm-v2__label">' + esc(label) + '</span>' +
            '<input type="text" class="hf-mono jms-tg-hm-v2__input" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
            '</label>';
    }

    function renderHeaderRow(row, idx) {
        row = row || emptyHeaderRow();
        return '<div class="jms-tg-hm-v2__header-row" data-hm-header-row data-hm-idx="' + idx + '">' +
            '<input type="text" class="jms-tg-hm-v2__input jms-tg-hm-v2__key" data-hm-field="key" value="' + esc(row.key || '') + '" placeholder="Header 名称" aria-label="请求头名称">' +
            '<input type="text" class="jms-tg-hm-v2__input jms-tg-hm-v2__val hf-mono" data-hm-field="value" value="' + esc(row.value || '') + '" placeholder="值" aria-label="请求头值">' +
            '<button type="button" class="jms-tg-hm-v2__row-del" data-hm-header-del title="删除" aria-label="删除请求头">×</button>' +
            '</div>';
    }

    function renderHeadersTable(d) {
        var headers = normalizeHeaders(d.headers);
        if (!headers.length) headers = [emptyHeaderRow()];
        var rows = headers.map(function (row, i) { return renderHeaderRow(row, i); }).join('');
        return '<div class="jms-tg-hm-v2__table-wrap">' +
            '<div class="jms-tg-hm-v2__table-head" aria-hidden="true">' +
            '<span>名称</span><span>值</span><span></span>' +
            '</div>' +
            '<div class="jms-tg-hm-v2__header-list" data-cfg-headers="1">' + rows + '</div>' +
            '</div>';
    }

    function renderHeaderManagerBody(item) {
        var d = (item && item.data) || defaultData();
        return '<div class="jms-tg-hm-v2" data-hm-ui-version="' + UI_VERSION + '">' +
            '<section class="jms-tg-hm-v2__card jms-tg-hm-v2__card--meta">' +
            '<div class="jms-tg-hm-v2__meta-row">' +
            hmTextField('名称', 'name', d.name, 'HTTP 信息头管理器', 'name') +
            hmTextField('注释', 'comments', d.comments, '可选', 'comments') +
            '</div></section>' +
            '<section class="jms-tg-hm-v2__card jms-tg-hm-v2__card--headers">' +
            '<div class="jms-tg-hm-v2__toolbar">' +
            '<span class="jms-tg-hm-v2__section-title">信息头存储在信息头管理器中</span>' +
            '<button type="button" class="jms-tg-hm-v2__add-btn" data-hm-header-add>添加请求头</button>' +
            '</div>' +
            renderHeadersTable(d) +
            '</section></div>';
    }

    function readHeadersFromBody(body) {
        if (!body) return [];
        var out = [];
        body.querySelectorAll('[data-hm-header-row]').forEach(function (row) {
            var k = row.querySelector('[data-hm-field="key"]');
            var v = row.querySelector('[data-hm-field="value"]');
            var key = k ? k.value.trim() : '';
            if (key) out.push({ key: key, value: v ? v.value : '' });
        });
        return out;
    }

    function readHeaderManagerFromBody(body, priorData) {
        var out = defaultData();
        if (priorData && typeof priorData === 'object') {
            if (priorData.name !== undefined) out.name = priorData.name;
            if (priorData.comments !== undefined) out.comments = priorData.comments;
            if (priorData.headers) out.headers = priorData.headers.slice();
        }
        if (!body) return out;
        var nameEl = body.querySelector('[data-cfg-field="name"]');
        var commentsEl = body.querySelector('[data-cfg-field="comments"]');
        out.name = nameEl ? nameEl.value.trim() : '';
        out.comments = commentsEl ? commentsEl.value : '';
        out.headers = readHeadersFromBody(body);
        return out;
    }

    function addHeaderRow(list) {
        if (!list) return;
        var idx = list.querySelectorAll('[data-hm-header-row]').length;
        list.insertAdjacentHTML('beforeend', renderHeaderRow(emptyHeaderRow(), idx));
        var rows = list.querySelectorAll('[data-hm-header-row]');
        var last = rows[rows.length - 1];
        var keyInput = last && last.querySelector('[data-hm-field="key"]');
        if (keyInput) keyInput.focus();
    }

    function onBodyClick(ev) {
        if (!ev.target.closest('#' + MODAL_ID)) return;

        if (ev.target.closest('[data-hm-header-add]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var root = ev.target.closest('.jms-tg-hm-v2');
            if (root) addHeaderRow(root.querySelector('[data-cfg-headers]'));
            return;
        }

        if (ev.target.closest('[data-hm-header-del]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var row = ev.target.closest('[data-hm-header-row]');
            var plist = row && row.parentElement;
            if (!row || !plist) return;
            if (plist.querySelectorAll('[data-hm-header-row]').length <= 1) {
                row.querySelectorAll('input[type="text"]').forEach(function (inp) { inp.value = ''; });
                return;
            }
            row.remove();
        }
    }

    function bind() {
        if (global.document.body.dataset.jmsTgHmV2Bound === '1') return;
        global.document.body.dataset.jmsTgHmV2Bound = '1';
        global.document.addEventListener('click', onBodyClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgHeaderManagerUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        renderHeaderManagerBody: renderHeaderManagerBody,
        readHeaderManagerFromBody: readHeaderManagerFromBody,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
