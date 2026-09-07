/**
 * 线程组配置元件 · HTTP 授权管理器弹窗 UI（隔离模块，仅 modal-tg-config-drawer-auth-manager）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-config-drawer-auth-manager';
    var UI_VERSION = '1';

    var MECHANISM_OPTIONS = global.JmsTgAuthManagerJmx && global.JmsTgAuthManagerJmx.MECHANISM_OPTIONS
        ? global.JmsTgAuthManagerJmx.MECHANISM_OPTIONS
        : [
            { value: 'BASIC_DIGEST', label: 'BASIC_DIGEST' },
            { value: 'BASIC', label: 'BASIC' },
            { value: 'DIGEST', label: 'DIGEST' },
            { value: 'KERBEROS', label: 'KERBEROS' }
        ];

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getCatalog() {
        return global.JmsTgConfigCatalog;
    }

    function blankFormData() {
        return {
            name: '', comments: '', clear_each_iteration: false, authorizations: []
        };
    }

    function defaultData() {
        var Catalog = getCatalog();
        return Catalog ? Catalog.defaultItemData('auth_manager') : blankFormData();
    }

    function resolveRenderData(item) {
        if (item && item.data && typeof item.data === 'object') {
            return item.data;
        }
        return blankFormData();
    }

    function normalizeAuthorizations(raw) {
        if (global.JmsTgAuthManagerJmx && typeof global.JmsTgAuthManagerJmx.normalizeAuthorizations === 'function') {
            return global.JmsTgAuthManagerJmx.normalizeAuthorizations(raw);
        }
        return Array.isArray(raw) ? raw : [];
    }

    function normalizeMechanism(val) {
        if (global.JmsTgAuthManagerJmx && typeof global.JmsTgAuthManagerJmx.normalizeMechanism === 'function') {
            return global.JmsTgAuthManagerJmx.normalizeMechanism(val);
        }
        return val ? String(val) : 'BASIC_DIGEST';
    }

    function emptyAuthRow() {
        return { url: '', username: '', password: '', domain: '', realm: '', mechanism: 'BASIC_DIGEST' };
    }

    function amTextField(label, fieldName, value, placeholder, width) {
        return '<label class="jms-tg-am-v2__field jms-tg-am-v2__field--' + (width || 'full') + '">' +
            '<span class="jms-tg-am-v2__label">' + esc(label) + '</span>' +
            '<input type="text" class="hf-mono jms-tg-am-v2__input" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
            '</label>';
    }

    function renderMechanismSelect(value) {
        var cur = normalizeMechanism(value);
        var opts = MECHANISM_OPTIONS.map(function (o) {
            return '<option value="' + esc(o.value) + '"' + (cur === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('');
        return '<select class="jms-tg-am-v2__input jms-tg-am-v2__mechanism-select" data-am-field="mechanism" aria-label="Mechanism">' + opts + '</select>';
    }

    function renderAuthRow(row, idx) {
        row = row || emptyAuthRow();
        return '<div class="jms-tg-am-v2__auth-row" data-am-auth-row data-am-idx="' + idx + '">' +
            '<input type="text" class="jms-tg-am-v2__input jms-tg-am-v2__url hf-mono" data-am-field="url" value="' + esc(row.url || '') + '" placeholder="基础 URL" aria-label="基础 URL">' +
            '<input type="text" class="jms-tg-am-v2__input jms-tg-am-v2__user hf-mono" data-am-field="username" value="' + esc(row.username || '') + '" placeholder="用户名" aria-label="用户名">' +
            '<input type="password" class="jms-tg-am-v2__input jms-tg-am-v2__pass hf-mono" data-am-field="password" value="' + esc(row.password || '') + '" placeholder="密码" aria-label="密码" autocomplete="new-password">' +
            '<input type="text" class="jms-tg-am-v2__input jms-tg-am-v2__domain hf-mono" data-am-field="domain" value="' + esc(row.domain || '') + '" placeholder="域" aria-label="域">' +
            '<input type="text" class="jms-tg-am-v2__input jms-tg-am-v2__realm hf-mono" data-am-field="realm" value="' + esc(row.realm || '') + '" placeholder="Realm" aria-label="Realm">' +
            renderMechanismSelect(row.mechanism) +
            '<button type="button" class="jms-tg-am-v2__row-del" data-am-auth-del title="删除" aria-label="删除授权行">×</button>' +
            '</div>';
    }

    function renderAuthTable(d) {
        var rows = normalizeAuthorizations(d.authorizations);
        if (!rows.length) rows = [emptyAuthRow()];
        var body = rows.map(function (row, i) { return renderAuthRow(row, i); }).join('');
        return '<div class="jms-tg-am-v2__table-wrap">' +
            '<div class="jms-tg-am-v2__table-head" aria-hidden="true">' +
            '<span>基础 URL</span><span>用户名</span><span>密码</span><span>域</span><span>Realm</span><span>Mechanism</span><span></span>' +
            '</div>' +
            '<div class="jms-tg-am-v2__auth-list" data-cfg-authorizations="1">' + body + '</div>' +
            '</div>';
    }

    function renderOptionsCard(d) {
        return '<section class="jms-tg-am-v2__card jms-tg-am-v2__card--options">' +
            '<h4 class="jms-tg-am-v2__card-title">Options</h4>' +
            '<label class="jms-tg-am-v2__chk-row">' +
            '<input type="checkbox" data-cfg-field="clear_each_iteration"' + (d.clear_each_iteration === true ? ' checked' : '') + '>' +
            '<span>Clear auth on each iteration?</span></label>' +
            '</section>';
    }

    function renderAuthManagerBody(item) {
        var d = resolveRenderData(item);
        if (item && item.name && !d.name) d.name = item.name;
        return '<div class="jms-tg-am-v2" data-am-ui-version="' + UI_VERSION + '">' +
            '<section class="jms-tg-am-v2__card jms-tg-am-v2__card--meta">' +
            '<div class="jms-tg-am-v2__meta-row">' +
            amTextField('名称', 'name', d.name, 'HTTP 授权管理器', 'name') +
            amTextField('注释', 'comments', d.comments, '可选', 'comments') +
            '</div></section>' +
            renderOptionsCard(d) +
            '<section class="jms-tg-am-v2__card jms-tg-am-v2__card--auth">' +
            '<div class="jms-tg-am-v2__toolbar">' +
            '<span class="jms-tg-am-v2__section-title">存储在授权管理器中的授权</span>' +
            '<button type="button" class="jms-tg-am-v2__add-btn" data-am-auth-add>添加授权</button>' +
            '</div>' +
            renderAuthTable(d) +
            '</section></div>';
    }

    function readAuthorizationsFromBody(body) {
        if (!body) return [];
        var out = [];
        body.querySelectorAll('[data-am-auth-row]').forEach(function (row) {
            var url = ((row.querySelector('[data-am-field="url"]') || {}).value || '').trim();
            var username = ((row.querySelector('[data-am-field="username"]') || {}).value || '').trim();
            var password = (row.querySelector('[data-am-field="password"]') || {}).value || '';
            var domain = (row.querySelector('[data-am-field="domain"]') || {}).value || '';
            var realm = (row.querySelector('[data-am-field="realm"]') || {}).value || '';
            var mechEl = row.querySelector('[data-am-field="mechanism"]');
            if (!url && !username && !password && !domain && !realm) return;
            out.push({
                url: url,
                username: username,
                password: password,
                domain: domain,
                realm: realm,
                mechanism: normalizeMechanism(mechEl ? mechEl.value : 'BASIC_DIGEST')
            });
        });
        return normalizeAuthorizations(out);
    }

    function readAuthManagerFromBody(body, priorData) {
        var out = blankFormData();
        if (priorData && typeof priorData === 'object') {
            Object.keys(out).forEach(function (k) {
                if (priorData[k] !== undefined) out[k] = priorData[k];
            });
            if (priorData.authorizations) out.authorizations = priorData.authorizations.slice();
        }
        if (!body) return out;
        var nameEl = body.querySelector('[data-cfg-field="name"]');
        var commentsEl = body.querySelector('[data-cfg-field="comments"]');
        out.name = nameEl ? nameEl.value.trim() : '';
        out.comments = commentsEl ? commentsEl.value : '';
        out.clear_each_iteration = !!((body.querySelector('[data-cfg-field="clear_each_iteration"]') || {}).checked);
        out.authorizations = readAuthorizationsFromBody(body);
        return out;
    }

    function addAuthRow(list) {
        if (!list) return;
        var idx = list.querySelectorAll('[data-am-auth-row]').length;
        list.insertAdjacentHTML('beforeend', renderAuthRow(emptyAuthRow(), idx));
        var rows = list.querySelectorAll('[data-am-auth-row]');
        var last = rows[rows.length - 1];
        var urlInput = last && last.querySelector('[data-am-field="url"]');
        if (urlInput) urlInput.focus();
    }

    function onBodyClick(ev) {
        if (!ev.target.closest('#' + MODAL_ID)) return;

        if (ev.target.closest('[data-am-auth-add]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var root = ev.target.closest('.jms-tg-am-v2');
            if (root) addAuthRow(root.querySelector('[data-cfg-authorizations]'));
            return;
        }

        if (ev.target.closest('[data-am-auth-del]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var row = ev.target.closest('[data-am-auth-row]');
            var plist = row && row.parentElement;
            if (!row || !plist) return;
            if (plist.querySelectorAll('[data-am-auth-row]').length <= 1) {
                row.querySelectorAll('input[type="text"], input[type="password"]').forEach(function (inp) { inp.value = ''; });
                var sel = row.querySelector('[data-am-field="mechanism"]');
                if (sel) sel.value = 'BASIC_DIGEST';
                return;
            }
            row.remove();
        }
    }

    function bind() {
        if (global.document.body.dataset.jmsTgAmV2Bound === '1') return;
        global.document.body.dataset.jmsTgAmV2Bound = '1';
        global.document.addEventListener('click', onBodyClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgAuthManagerUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        blankFormData: blankFormData,
        renderAuthManagerBody: renderAuthManagerBody,
        readAuthManagerFromBody: readAuthManagerFromBody,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
