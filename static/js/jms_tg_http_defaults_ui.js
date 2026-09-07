/**
 * 线程组配置元件 · HTTP 请求默认值弹窗 UI（隔离模块，仅 modal-tg-config-drawer-http-defaults）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-config-drawer-http-defaults';
    var UI_VERSION = '12';

    var DEFAULT_PARAM_CONTENT_TYPE = 'text/plain';

    var IMPL_OPTIONS = [
        { value: 'HttpClient4', label: 'HttpClient4' },
        { value: 'Java', label: 'Java' },
        { value: '', blank: true }
    ];

    /** 已从 UI 移除、保存时需继承原值的字段 */
    var PRESERVE_ON_READ_KEYS = ['follow_redirects', 'auto_redirects', 'use_keepalive'];

    function hdTextField(label, fieldName, value, placeholder, width, disabled) {
        var dis = disabled ? ' disabled' : '';
        return '<label class="jms-tg-hd-v2__field jms-tg-hd-v2__field--' + width + '">' +
            '<span class="jms-tg-hd-v2__label">' + esc(label) + '</span>' +
            '<input type="text" class="hf-mono jms-tg-hd-v2__input" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '"' + dis + '>' +
            '</label>';
    }

    function hdCheckbox(label, fieldName, checked, disabled) {
        var dis = disabled ? ' disabled' : '';
        return '<label class="jms-tg-hd-v2__chk-row">' +
            '<input type="checkbox" data-cfg-field="' + fieldName + '"' + (checked ? ' checked' : '') + dis + '>' +
            '<span>' + esc(label) + '</span></label>';
    }

    function resolveImplVal(d) {
        var v = d && d.implementation;
        if (v === undefined || v === null || v === '') return '';
        if (v === 'Java') return 'Java';
        if (v === 'HttpClient4') return 'HttpClient4';
        return String(v);
    }

    function emptyParamRow() {
        return {
            name: '', value: '', always_encode: false, use_equals: true,
            content_type: DEFAULT_PARAM_CONTENT_TYPE
        };
    }

    /** 参数行 Content-Type 展示值（未设置时默认 text/plain，用户可改） */
    function paramContentTypeDisplay(row) {
        if (!row) return DEFAULT_PARAM_CONTENT_TYPE;
        var v = row.content_type;
        if (v === undefined || v === null || String(v).trim() === '') return DEFAULT_PARAM_CONTENT_TYPE;
        return String(v);
    }

    function renderImplOptions(implVal) {
        return IMPL_OPTIONS.map(function (o) {
            var sel = implVal === o.value ? ' selected' : '';
            if (o.blank) {
                return '<option value=""' + sel + '></option>';
            }
            return '<option value="' + esc(o.value) + '"' + sel + '>' + esc(o.label) + '</option>';
        }).join('');
    }

    function hdInlineInput(label, fieldName, value, placeholder, widthClass, disabled) {
        var dis = disabled ? ' disabled' : '';
        var wc = widthClass || '';
        return '<label class="jms-tg-hd-v2__inline-field' + (wc ? ' ' + wc : '') + '">' +
            '<span class="jms-tg-hd-v2__inline-label">' + esc(label) + '</span>' +
            '<input type="text" class="hf-mono jms-tg-hd-v2__input jms-tg-hd-v2__input--sm" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '"' + dis + '>' +
            '</label>';
    }

    function renderTimeoutImplRow(d) {
        var implVal = resolveImplVal(d);
        return '<div class="jms-tg-hd-v2__timeout-row">' +
            hdTextField('连接 (ms)', 'connect_timeout', d.connect_timeout, '5000', 'third') +
            hdTextField('响应 (ms)', 'response_timeout', d.response_timeout, '30000', 'third') +
            '<label class="jms-tg-hd-v2__field jms-tg-hd-v2__field--third">' +
            '<span class="jms-tg-hd-v2__label">实现</span>' +
            '<select class="jms-tg-hd-v2__input" data-cfg-field="implementation">' + renderImplOptions(implVal) + '</select></label>' +
            '</div>';
    }

    function renderEmbeddedSection(d) {
        var imgOn = !!d.image_parser;
        return '<section class="jms-tg-hd-v2__card jms-tg-hd-v2__card--embedded" data-hd-embedded-section>' +
            '<div class="jms-tg-hd-v2__embedded-compact">' +
            '<span class="jms-tg-hd-v2__embedded-title">HTML 内含资源</span>' +
            '<label class="jms-tg-hd-v2__embedded-flag">' +
            '<input type="checkbox" data-cfg-field="image_parser"' + (imgOn ? ' checked' : '') + '>' +
            '<span>获取内含资源</span></label>' +
            '<div class="jms-tg-hd-v2__embedded-deps' + (imgOn ? '' : ' is-disabled') + '" data-hd-embedded-deps>' +
            '<label class="jms-tg-hd-v2__embedded-flag">' +
            '<input type="checkbox" data-cfg-field="concurrent_dwn"' + (d.concurrent_dwn ? ' checked' : '') + (imgOn ? '' : ' disabled') + '>' +
            '<span>并行下载</span></label>' +
            hdInlineInput('数量', 'concurrent_pool', d.concurrent_pool, '6', 'jms-tg-hd-v2__inline-field--pool', !imgOn) +
            hdInlineInput('匹配', 'embedded_url_re', d.embedded_url_re, '网址必须匹配', 'jms-tg-hd-v2__inline-field--match', !imgOn) +
            '</div></div></section>';
    }

    function syncEmbeddedDeps(root) {
        if (!root) return;
        var section = root.querySelector('[data-hd-embedded-section]');
        if (!section) return;
        var master = section.querySelector('[data-cfg-field="image_parser"]');
        var on = !!(master && master.checked);
        var panel = section.querySelector('[data-hd-embedded-deps]');
        if (panel) panel.classList.toggle('is-disabled', !on);
        section.querySelectorAll('[data-hd-embedded-deps] [data-cfg-field]').forEach(function (el) {
            el.disabled = !on;
        });
    }

    function afterRender(bodyEl) {
        if (!bodyEl) return;
        var root = bodyEl.querySelector('.jms-tg-hd-v2');
        if (root) syncEmbeddedDeps(root);
    }

    function hdSelectField(label, fieldName, value, options, width) {
        var opts = options.map(function (o) {
            return '<option value="' + esc(o.value) + '"' + (String(value) === String(o.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('');
        return '<label class="jms-tg-hd-v2__field jms-tg-hd-v2__field--' + width + '">' +
            '<span class="jms-tg-hd-v2__label">' + esc(label) + '</span>' +
            '<select class="jms-tg-hd-v2__input" data-cfg-field="' + fieldName + '">' + opts + '</select></label>';
    }

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getCatalog() {
        return global.JmsTgConfigCatalog;
    }

    function getJmx() {
        return global.JmsTgHttpDefaultsJmx;
    }

    function normalizeParams(raw) {
        var Jmx = getJmx();
        if (Jmx && typeof Jmx.normalizeParameters === 'function') {
            return Jmx.normalizeParameters(raw);
        }
        if (!Array.isArray(raw)) return [];
        return raw.filter(function (r) { return r && (String(r.name || '').trim() || String(r.value || '').trim()); });
    }

    function renderParamRow(row, idx) {
        row = row || {};
        return '<div class="jms-tg-hd-v2__param-row" data-param-idx="' + idx + '">' +
            '<input type="text" class="jms-tg-hd-v2__input jms-tg-hd-v2__param-name" data-param-field="name" value="' + esc(row.name || '') + '" placeholder="名称" aria-label="参数名称">' +
            '<input type="text" class="jms-tg-hd-v2__input jms-tg-hd-v2__param-value hf-mono" data-param-field="value" value="' + esc(row.value || '') + '" placeholder="值" aria-label="参数值">' +
            '<label class="jms-tg-hd-v2__param-chk" title="URL 编码">' +
            '<input type="checkbox" data-param-field="always_encode"' + (row.always_encode ? ' checked' : '') + '>' +
            '<span class="jms-tg-hd-v2__param-chk-sr">编码</span></label>' +
            '<input type="text" class="jms-tg-hd-v2__input jms-tg-hd-v2__param-ctype" data-param-field="content_type" value="' + esc(paramContentTypeDisplay(row)) + '" placeholder="' + esc(DEFAULT_PARAM_CONTENT_TYPE) + '" aria-label="Content-Type">' +
            '<label class="jms-tg-hd-v2__param-chk jms-tg-hd-v2__param-chk--equals" title="是否等于">' +
            '<input type="checkbox" data-param-field="use_equals"' + (row.use_equals !== false ? ' checked' : '') + '>' +
            '<span class="jms-tg-hd-v2__param-chk-sr">是否等于</span></label>' +
            '<button type="button" class="jms-tg-hd-v2__param-del" data-hd-param-del title="删除" aria-label="删除参数">×</button>' +
            '</div>';
    }

    function renderParamsTable(d) {
        var params = normalizeParams(d.parameters);
        if (!params.length) params = [emptyParamRow()];
        var rows = params.map(function (row, i) { return renderParamRow(row, i); }).join('');
        return '<div class="jms-tg-hd-v2__arg-block" data-hd-arg-panel="params">' +
            '<div class="jms-tg-hd-v2__param-head" aria-hidden="true">' +
            '<span>名称</span><span>值</span><span>编码?</span><span>Content-Type</span><span>是否等于</span><span></span>' +
            '</div>' +
            '<div class="jms-tg-hd-v2__param-list" data-hd-param-list>' + rows + '</div>' +
            '<div class="jms-tg-hd-v2__param-actions">' +
            '<button type="button" class="jms-tg-hd-v2__param-add" data-hd-param-add>添加参数</button>' +
            '</div></div>';
    }

    function renderBodyPanel(d) {
        return '<div class="jms-tg-hd-v2__arg-block" data-hd-arg-panel="body" hidden>' +
            '<textarea class="jms-tg-hd-v2__body-input hf-mono" data-hd-body-input rows="6" placeholder="同请求一起发送的消息体数据…">' +
            esc(d.body_data || '') + '</textarea></div>';
    }

    function renderArgSection(d) {
        var mode = d.arg_mode === 'body' ? 'body' : 'params';
        return '<div class="jms-tg-hd-v2__arg-section">' +
            '<div class="jms-tg-hd-v2__arg-head">' +
            '<span class="jms-tg-hd-v2__arg-title">同请求一起发送</span>' +
            '<div class="jms-tg-hd-v2__arg-tabs" role="tablist" aria-label="参数或消息体">' +
            '<button type="button" class="jms-tg-hd-v2__arg-tab' + (mode === 'params' ? ' is-active' : '') + '" data-hd-arg-tab="params" role="tab" aria-selected="' + (mode === 'params' ? 'true' : 'false') + '">参数</button>' +
            '<button type="button" class="jms-tg-hd-v2__arg-tab' + (mode === 'body' ? ' is-active' : '') + '" data-hd-arg-tab="body" role="tab" aria-selected="' + (mode === 'body' ? 'true' : 'false') + '">消息体数据</button>' +
            '</div></div>' +
            renderParamsTable(d) +
            renderBodyPanel(d) +
            '</div>';
    }

    function renderMetaRow(d) {
        return '<div class="jms-tg-hd-v2__meta-row">' +
            hdTextField('名称', 'name', d.name, 'HTTP 请求默认值', 'meta-name') +
            hdTextField('注释', 'comments', d.comments, '可选', 'meta-comments') +
            '</div>';
    }

    function renderBasicUnifiedCard(d) {
        return '<section class="jms-tg-hd-v2__card jms-tg-hd-v2__card--basic">' +
            renderMetaRow(d) +
            '<div class="jms-tg-hd-v2__basic-grid">' +
            hdTextField('协议', 'protocol', d.protocol, 'https', 'proto') +
            hdTextField('服务器名称或 IP', 'domain', d.domain, 'api.example.com', 'host') +
            hdTextField('端口号', 'port', d.port, '443', 'port') +
            '<div class="jms-tg-hd-v2__basic-divider" aria-hidden="true"></div>' +
            hdTextField('路径', 'path', d.path, '/', 'path') +
            hdTextField('内容编码', 'content_encoding', d.content_encoding, 'UTF-8', 'encoding') +
            '</div>' +
            renderArgSection(d) +
            '</section>';
    }

    function renderAdvancedPanel(d) {
        var ipType = d.ip_source_type != null ? String(d.ip_source_type) : '0';
        return '<section class="jms-tg-hd-v2__card jms-tg-hd-v2__card--adv">' +
            '<h4 class="jms-tg-hd-v2__basic-title">客户端与超时</h4>' +
            renderTimeoutImplRow(d) +
            '</section>' +
            renderEmbeddedSection(d) +
            '<section class="jms-tg-hd-v2__card jms-tg-hd-v2__card--adv">' +
            '<h4 class="jms-tg-hd-v2__basic-title">源地址</h4>' +
            '<div class="jms-tg-hd-v2__source-row">' +
            hdSelectField('类型', 'ip_source_type', ipType, [
                { value: '0', label: 'IP / 主机名' },
                { value: '1', label: '设备' }
            ], 'type') +
            hdTextField('地址', 'ip_source', d.ip_source, '', 'addr') +
            '</div></section>' +
            '<section class="jms-tg-hd-v2__card jms-tg-hd-v2__card--adv">' +
            '<h4 class="jms-tg-hd-v2__basic-title">代理服务器</h4>' +
            '<div class="jms-tg-hd-v2__proxy-grid">' +
            hdTextField('服务器名称或 IP', 'proxy_host', d.proxy_host, '', 'half') +
            hdTextField('端口号', 'proxy_port', d.proxy_port, '', 'quarter') +
            hdTextField('用户名', 'proxy_user', d.proxy_user, '', 'half') +
            hdTextField('密码', 'proxy_pass', d.proxy_pass, '', 'half') +
            '</div></section>' +
            '<section class="jms-tg-hd-v2__card jms-tg-hd-v2__card--adv jms-tg-hd-v2__card--adv-last">' +
            '<h4 class="jms-tg-hd-v2__basic-title">其他</h4>' +
            hdCheckbox('保存响应为 MD5 哈希', 'md5', d.md5) +
            '</section>';
    }

    function renderHttpDefaultsBody(item) {
        var Catalog = getCatalog();
        var d = (item && item.data) || (Catalog ? Catalog.defaultItemData('http_defaults') : {});

        return '<div class="jms-tg-hd-v2" data-hd-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-tg-hd-v2__tabs" role="tablist" aria-label="HTTP 请求默认值配置">' +
            '<button type="button" class="jms-tg-hd-v2__tab is-active" data-hd-tab="basic" role="tab" aria-selected="true">基本</button>' +
            '<button type="button" class="jms-tg-hd-v2__tab" data-hd-tab="advanced" role="tab" aria-selected="false">高级</button>' +
            '</div>' +
            '<div class="jms-tg-hd-v2__panel is-active" data-hd-panel="basic" role="tabpanel">' +
            renderBasicUnifiedCard(d) +
            '</div>' +
            '<div class="jms-tg-hd-v2__panel" data-hd-panel="advanced" role="tabpanel" hidden>' +
            '<div class="jms-tg-hd-v2__adv-scroll">' +
            renderAdvancedPanel(d) +
            '</div></div>' +
            '</div>';
    }

    function readParametersFromBody(body) {
        var list = body ? body.querySelector('[data-hd-param-list]') : null;
        if (!list) return [];
        var rows = [];
        list.querySelectorAll('.jms-tg-hd-v2__param-row').forEach(function (row) {
            var item = emptyParamRow();
            row.querySelectorAll('[data-param-field]').forEach(function (el) {
                var f = el.getAttribute('data-param-field');
                if (!f) return;
                if (el.type === 'checkbox') item[f] = !!el.checked;
                else item[f] = el.value;
            });
            if (String(item.name || '').trim() || String(item.value || '').trim()) rows.push(item);
        });
        return normalizeParams(rows);
    }

    function readArgModeFromBody(body) {
        if (!body) return 'params';
        var active = body.querySelector('.jms-tg-hd-v2__arg-tab.is-active');
        return active && active.getAttribute('data-hd-arg-tab') === 'body' ? 'body' : 'params';
    }

    function readHttpDefaultsFromBody(body, priorData) {
        var Catalog = getCatalog();
        var out = Catalog ? Catalog.defaultItemData('http_defaults') : {};
        if (priorData && typeof priorData === 'object') {
            PRESERVE_ON_READ_KEYS.forEach(function (k) {
                if (priorData[k] !== undefined) out[k] = priorData[k];
            });
            if (priorData.arg_mode) out.arg_mode = priorData.arg_mode;
            if (priorData.parameters) out.parameters = priorData.parameters.slice();
            if (priorData.body_data !== undefined) out.body_data = priorData.body_data;
        }
        if (!body) return out;
        body.querySelectorAll('[data-cfg-field]').forEach(function (el) {
            var f = el.getAttribute('data-cfg-field');
            if (!f) return;
            if (el.type === 'checkbox') out[f] = !!el.checked;
            else out[f] = el.value.trim();
        });
        out.arg_mode = readArgModeFromBody(body);
        out.parameters = readParametersFromBody(body);
        var bodyTa = body.querySelector('[data-hd-body-input]');
        out.body_data = bodyTa ? bodyTa.value : '';
        return out;
    }

    function switchTab(root, tabKey) {
        if (!root) return;
        root.querySelectorAll('.jms-tg-hd-v2__tab').forEach(function (btn) {
            var on = btn.getAttribute('data-hd-tab') === tabKey;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        root.querySelectorAll('.jms-tg-hd-v2__panel').forEach(function (panel) {
            var on = panel.getAttribute('data-hd-panel') === tabKey;
            panel.classList.toggle('is-active', on);
            if (on) panel.removeAttribute('hidden');
            else panel.setAttribute('hidden', 'hidden');
        });
        if (tabKey === 'advanced') syncEmbeddedDeps(root);
    }

    function switchArgTab(section, tabKey) {
        if (!section) return;
        section.querySelectorAll('.jms-tg-hd-v2__arg-tab').forEach(function (btn) {
            var on = btn.getAttribute('data-hd-arg-tab') === tabKey;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        section.querySelectorAll('[data-hd-arg-panel]').forEach(function (panel) {
            var on = panel.getAttribute('data-hd-arg-panel') === tabKey;
            if (on) panel.removeAttribute('hidden');
            else panel.setAttribute('hidden', 'hidden');
        });
    }

    function addParamRow(list) {
        if (!list) return;
        var idx = list.querySelectorAll('.jms-tg-hd-v2__param-row').length;
        list.insertAdjacentHTML('beforeend', renderParamRow(emptyParamRow(), idx));
    }

    function onBodyClick(ev) {
        if (!ev.target.closest('#' + MODAL_ID)) return;

        var tabBtn = ev.target.closest('.jms-tg-hd-v2__tab');
        if (tabBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            switchTab(tabBtn.closest('.jms-tg-hd-v2'), tabBtn.getAttribute('data-hd-tab'));
            return;
        }

        var argTabBtn = ev.target.closest('.jms-tg-hd-v2__arg-tab');
        if (argTabBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            switchArgTab(argTabBtn.closest('.jms-tg-hd-v2__arg-section'), argTabBtn.getAttribute('data-hd-arg-tab'));
            return;
        }

        if (ev.target.closest('[data-hd-param-add]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var root = ev.target.closest('.jms-tg-hd-v2');
            if (root) addParamRow(root.querySelector('[data-hd-param-list]'));
            return;
        }

        if (ev.target.closest('[data-hd-param-del]')) {
            ev.preventDefault();
            ev.stopPropagation();
            var row = ev.target.closest('.jms-tg-hd-v2__param-row');
            var plist = row && row.parentElement;
            if (!row || !plist) return;
            if (plist.querySelectorAll('.jms-tg-hd-v2__param-row').length <= 1) {
                row.querySelectorAll('input[type="text"]').forEach(function (inp) { inp.value = ''; });
                row.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
                    cb.checked = cb.getAttribute('data-param-field') === 'use_equals';
                });
                return;
            }
            row.remove();
        }
    }

    function onBodyChange(ev) {
        if (!ev.target.closest('#' + MODAL_ID)) return;
        if (ev.target.getAttribute('data-cfg-field') === 'image_parser') {
            syncEmbeddedDeps(ev.target.closest('.jms-tg-hd-v2'));
        }
    }

    function bind() {
        if (global.document.body.dataset.jmsTgHdV2Bound === '1') return;
        global.document.body.dataset.jmsTgHdV2Bound = '1';
        global.document.addEventListener('click', onBodyClick, true);
        global.document.addEventListener('change', onBodyChange, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgHttpDefaultsUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        renderHttpDefaultsBody: renderHttpDefaultsBody,
        readHttpDefaultsFromBody: readHttpDefaultsFromBody,
        switchTab: switchTab,
        afterRender: afterRender,
        syncEmbeddedDeps: syncEmbeddedDeps,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
