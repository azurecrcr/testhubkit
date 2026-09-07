/**
 * 线程组配置元件 · HTTP Cookie 管理器弹窗 UI（隔离模块，仅 modal-tg-config-drawer-cookie-manager）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-config-drawer-cookie-manager';
    var UI_VERSION = '2';

    var POLICY_OPTIONS = global.JmsTgCookieManagerJmx && global.JmsTgCookieManagerJmx.POLICY_OPTIONS
        ? global.JmsTgCookieManagerJmx.POLICY_OPTIONS
        : [
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
        return Catalog ? Catalog.defaultItemData('cookie_manager') : {
            name: '', comments: '', clear_each_iteration: true,
            cookie_policy: 'standard', cookies: []
        };
    }

    function normalizeCookies(raw) {
        var Catalog = getCatalog();
        if (Catalog && typeof Catalog.normalizeCookies === 'function') {
            return Catalog.normalizeCookies(raw);
        }
        if (!Array.isArray(raw)) return [];
        return raw.filter(function (c) { return c && String(c.name || '').trim(); });
    }

    function emptyCookieRow() {
        return { name: '', value: '', domain: '', path: '/', secure: false, expires: '' };
    }

    function cmTextField(label, fieldName, value, placeholder, width) {
        return '<label class="jms-tg-cm-v2__field jms-tg-cm-v2__field--' + width + '">' +
            '<span class="jms-tg-cm-v2__label">' + esc(label) + '</span>' +
            '<input type="text" class="hf-mono jms-tg-cm-v2__input" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
            '</label>';
    }

    function renderCookieRow(row, idx) {
        row = row || emptyCookieRow();
        return '<div class="jms-tg-cm-v2__cookie-row" data-cm-cookie-row data-cm-idx="' + idx + '">' +
            '<input type="text" class="jms-tg-cm-v2__input jms-tg-cm-v2__name" data-cm-field="name" value="' + esc(row.name || '') + '" placeholder="名称" aria-label="Cookie 名称">' +
            '<input type="text" class="jms-tg-cm-v2__input jms-tg-cm-v2__val hf-mono" data-cm-field="value" value="' + esc(row.value || '') + '" placeholder="值" aria-label="Cookie 值">' +
            '<input type="text" class="jms-tg-cm-v2__input jms-tg-cm-v2__domain hf-mono" data-cm-field="domain" value="' + esc(row.domain || '') + '" placeholder="域" aria-label="Cookie 域">' +
            '<input type="text" class="jms-tg-cm-v2__input jms-tg-cm-v2__path hf-mono" data-cm-field="path" value="' + esc(row.path || '/') + '" placeholder="/" aria-label="Cookie 路径">' +
            '<label class="jms-tg-cm-v2__secure-chk" title="Secure">' +
            '<input type="checkbox" data-cm-field="secure"' + (row.secure ? ' checked' : '') + '>' +
            '<span class="jms-tg-cm-v2__secure-sr">安全</span></label>' +
            '<button type="button" class="jms-tg-cm-v2__row-del" data-cm-cookie-del title="删除" aria-label="删除 Cookie">×</button>' +
            '</div>';
    }

    function renderCookiesTable(d) {
        var cookies = normalizeCookies(d.cookies);
        if (!cookies.length) cookies = [emptyCookieRow()];
        var rows = cookies.map(function (row, i) { return renderCookieRow(row, i); }).join('');
        return '<div class="jms-tg-cm-v2__table-wrap">' +
            '<div class="jms-tg-cm-v2__table-head" aria-hidden="true">' +
            '<span>名称</span><span>值</span><span>域</span><span>路径</span><span>安全</span><span></span>' +
            '</div>' +
            '<div class="jms-tg-cm-v2__cookie-list" data-cfg-cookies="1">' + rows + '</div>' +
            '</div>';
    }

    function normalizePolicy(val) {
        if (global.JmsTgCookieManagerJmx && typeof global.JmsTgCookieManagerJmx.normalizeCookiePolicy === 'function') {
            return global.JmsTgCookieManagerJmx.normalizeCookiePolicy(val);
        }
        return val ? String(val) : 'standard';
    }

    function renderPolicySelect(d) {
        var policy = normalizePolicy(d.cookie_policy);
        var opts = POLICY_OPTIONS.map(function (o) {
            return '<option value="' + esc(o.value) + '"' + (policy === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('');
        return '<label class="jms-tg-cm-v2__field jms-tg-cm-v2__field--policy">' +
            '<span class="jms-tg-cm-v2__label">Cookie Policy</span>' +
            '<select class="jms-tg-cm-v2__input jms-tg-cm-v2__policy-select" data-cfg-field="cookie_policy">' + opts + '</select>' +
            '</label>';
    }

    function renderOptionsCard(d) {
        return '<section class="jms-tg-cm-v2__card jms-tg-cm-v2__card--options">' +
            '<h4 class="jms-tg-cm-v2__card-title">选项</h4>' +
            '<div class="jms-tg-cm-v2__options">' +
            '<label class="jms-tg-cm-v2__chk-row">' +
            '<input type="checkbox" data-cfg-field="clear_each_iteration"' + (d.clear_each_iteration !== false ? ' checked' : '') + '>' +
            '<span>每次迭代清除 Cookie</span></label>' +
            renderPolicySelect(d) +
            '</div></section>';
    }

    function renderCookieManagerBody(item) {
        var d = (item && item.data) || defaultData();
        return '<div class="jms-tg-cm-v2" data-cm-ui-version="' + UI_VERSION + '">' +
            '<section class="jms-tg-cm-v2__card jms-tg-cm-v2__card--meta">' +
            '<div class="jms-tg-cm-v2__meta-row">' +
            cmTextField('名称', 'name', d.name, 'HTTP Cookie 管理器', 'name') +
            cmTextField('注释', 'comments', d.comments, '可选', 'comments') +
            '</div></section>' +
            renderOptionsCard(d) +
            '<section class="jms-tg-cm-v2__card jms-tg-cm-v2__card--cookies">' +
            '<div class="jms-tg-cm-v2__toolbar">' +
            '<span class="jms-tg-cm-v2__section-title">存储在 Cookie 管理器中的 Cookie</span>' +
            '<button type="button" class="jms-tg-cm-v2__add-btn" data-cm-cookie-add>添加 Cookie</button>' +
            '</div>' +
            renderCookiesTable(d) +
            '</section></div>';
    }

    function readCookiesFromBody(body) {
        if (!body) return [];
        var out = [];
        body.querySelectorAll('[data-cm-cookie-row]').forEach(function (row) {
            var nameEl = row.querySelector('[data-cm-field="name"]');
            var name = nameEl ? nameEl.value.trim() : '';
            if (!name) return;
            out.push({
                name: name,
                value: (row.querySelector('[data-cm-field="value"]') || {}).value || '',
                domain: (row.querySelector('[data-cm-field="domain"]') || {}).value || '',
                path: (row.querySelector('[data-cm-field="path"]') || {}).value || '/',
                secure: !!((row.querySelector('[data-cm-field="secure"]') || {}).checked),
                expires: ''
            });
        });
        return normalizeCookies(out);
    }

    function readCookieManagerFromBody(body, priorData) {
        var out = defaultData();
        if (priorData && typeof priorData === 'object') {
            Object.keys(out).forEach(function (k) {
                if (priorData[k] !== undefined) out[k] = priorData[k];
            });
            if (priorData.cookies) out.cookies = priorData.cookies.slice();
        }
        if (!body) return out;
        var nameEl = body.querySelector('[data-cfg-field="name"]');
        var commentsEl = body.querySelector('[data-cfg-field="comments"]');
        out.name = nameEl ? nameEl.value.trim() : '';
        out.comments = commentsEl ? commentsEl.value : '';
        out.clear_each_iteration = !!((body.querySelector('[data-cfg-field="clear_each_iteration"]') || {}).checked);
        var policyEl = body.querySelector('[data-cfg-field="cookie_policy"]');
        out.cookie_policy = normalizePolicy(policyEl ? policyEl.value : out.cookie_policy);
        out.cookies = readCookiesFromBody(body);
        return out;
    }

    function addCookieRow(list) {
        if (!list) return;
        var idx = list.querySelectorAll('[data-cm-cookie-row]').length;
        list.insertAdjacentHTML('beforeend', renderCookieRow(emptyCookieRow(), idx));
        var rows = list.querySelectorAll('[data-cm-cookie-row]');
        var last = rows[rows.length - 1];
        var nameInput = last && last.querySelector('[data-cm-field="name"]');
        if (nameInput) nameInput.focus();
    }

    function onBodyClick(ev) {
        if (!ev.target.closest('#' + MODAL_ID)) return;

        if (ev.target.closest('[data-cm-cookie-add]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var root = ev.target.closest('.jms-tg-cm-v2');
            if (root) addCookieRow(root.querySelector('[data-cfg-cookies]'));
            return;
        }

        if (ev.target.closest('[data-cm-cookie-del]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var row = ev.target.closest('[data-cm-cookie-row]');
            var plist = row && row.parentElement;
            if (!row || !plist) return;
            if (plist.querySelectorAll('[data-cm-cookie-row]').length <= 1) {
                row.querySelectorAll('input[type="text"]').forEach(function (inp) { inp.value = inp.getAttribute('data-cm-field') === 'path' ? '/' : ''; });
                var sec = row.querySelector('[data-cm-field="secure"]');
                if (sec) sec.checked = false;
                return;
            }
            row.remove();
        }
    }

    function bind() {
        if (global.document.body.dataset.jmsTgCmV2Bound === '2') return;
        global.document.body.dataset.jmsTgCmV2Bound = '2';
        global.document.addEventListener('click', onBodyClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgCookieManagerUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        renderCookieManagerBody: renderCookieManagerBody,
        readCookieManagerFromBody: readCookieManagerFromBody,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
