/**
 * 树形视图 · 线程组配置元件 UI（隔离模块，config_items）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsTgConfigCatalog;

    var DRAWER_META = {
        http_defaults: {
            id: 'modal-tg-config-drawer-http-defaults',
            badge: 'HTTP Defaults',
            title: 'HTTP 请求默认值',
            sub: ''
        },
        header_manager: {
            id: 'modal-tg-config-drawer-header-manager',
            badge: 'Header',
            title: 'HTTP 信息头管理器',
            sub: ''
        },
        auth_manager: {
            id: 'modal-tg-config-drawer-auth-manager',
            badge: 'Auth',
            title: 'HTTP 授权管理器',
            sub: ''
        },
        cookie_manager: {
            id: 'modal-tg-config-drawer-cookie-manager',
            badge: 'Cookie',
            title: 'HTTP Cookie 管理器',
            sub: ''
        },
        cache_manager: {
            id: 'modal-tg-config-drawer-cache-manager',
            badge: 'Cache Manager',
            title: 'HTTP 缓存管理器',
            sub: ''
        },
        csv_data_set: {
            id: 'modal-tg-config-drawer-csv-data-set',
            badge: 'CSV Data Set',
            title: 'CSV 数据文件设置',
            sub: ''
        },
        counter: {
            id: 'modal-tg-config-drawer-counter',
            badge: 'Counter',
            title: '计数器',
            sub: ''
        }
    };

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(model, planId, tgId) {
        if (!model) return null;
        var tg = (model.setup_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (!plan) return null;
        tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        return (model.post_thread_groups || []).find(function (t) { return t.id === tgId; }) || null;
    }

    function ensureItems(tg) {
        return Catalog ? Catalog.ensureConfigItems(tg) : (tg.config_items = tg.config_items || []);
    }

    function findItem(tg, itemId) {
        return ensureItems(tg).find(function (it) { return it && it.id === itemId; }) || null;
    }

    function applyConfigItemRemoval(tg, item) {
        if (!tg || !item || !item.type) return;
        var Sync = global.JmsTgConfigExportSync;
        if (Sync && typeof Sync.syncConfigItemRemoval === 'function') {
            Sync.syncConfigItemRemoval(tg, item);
            return;
        }
        tg._config_timeline_active = true;
        var list = Array.isArray(tg._removed_config_types) ? tg._removed_config_types.slice() : [];
        if (list.indexOf(item.type) < 0) list.push(item.type);
        tg._removed_config_types = list;
        if (!tg.http_managers || typeof tg.http_managers !== 'object') return;
        var mgr = tg.http_managers;
        var typeKey = item.type;
        if (mgr[typeKey] && typeof mgr[typeKey] === 'object') {
            mgr[typeKey].enabled = false;
            if (typeKey === 'csv_data_set') {
                mgr[typeKey].filename = '';
                mgr[typeKey].variable_names = '';
                mgr[typeKey].file_content = '';
            }
        }
        if (Array.isArray(mgr.selected_types)) {
            mgr.selected_types = mgr.selected_types.filter(function (k) { return k !== typeKey; });
        }
    }

    function markDirtyAndSync(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        if (global.JmsTgTreeShell &&
            typeof global.JmsTgTreeShell.refreshTgDetailByTgId === 'function' &&
            planId && tgId &&
            global.JmsTgTreeShell.refreshTgDetailByTgId(planId, tgId)) {
            return;
        }
        if (planId && tgId && patchConfigNodesInSteps(planId, tgId)) {
            return;
        }
        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.syncAll === 'function') {
            global.JmsTgTreeShell.syncAll(true);
        }
    }

    function patchConfigMenuState(block, tg) {
        if (!block || !tg || !Catalog) return;
        var menuWrap = block.querySelector('.jms-tg-config-more');
        if (!menuWrap) return;
        var trigger = menuWrap.querySelector('.jms-tg-config-trigger');
        var configured = Catalog.anyItems(tg);
        if (trigger) trigger.classList.toggle('is-on', configured);
    }

    function patchConfigNodesInSteps(planId, tgId) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg) return false;
        if (global.JmsTgDetailTimeline &&
            typeof global.JmsTgDetailTimeline.canUse === 'function' &&
            global.JmsTgDetailTimeline.canUse(tg)) {
            return false;
        }
        var block = global.document.querySelector('.jms-tg-block--tree[data-plan-id="' + planId + '"][data-tg-id="' + tgId + '"]');
        if (!block) return false;
        var stepsEl = block.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        stepsEl.querySelectorAll('.jms-tree-node--config:not(.jms-tree-node--config-nested)').forEach(function (node) {
            node.remove();
        });
        var html = renderConfigNodes(planId, tg);
        if (html) {
            var tmp = global.document.createElement('div');
            tmp.innerHTML = html;
            while (tmp.firstChild) {
                stepsEl.appendChild(tmp.firstChild);
            }
        }
        patchConfigMenuState(block, tg);
        return true;
    }

    function renderKvRows(list) {
        list = list || [];
        if (!list.length) {
            return '<p class="jms-empty-hint">暂无请求头</p>';
        }
        return list.map(function (row) {
            return '<div class="jms-kv-row jms-tg-config-drawer__kv-row">' +
                '<input type="text" class="jms-kv-key hf-mono" placeholder="Header 名" value="' + esc(row.key || '') + '">' +
                '<input type="text" class="jms-kv-val hf-mono" placeholder="值" value="' + esc(row.value || '') + '">' +
                '<span></span><button type="button" class="jms-kv-del" aria-label="删除">×</button></div>';
        }).join('');
    }

    function renderCookieRows(list) {
        list = list || [];
        if (!list.length) {
            return '<p class="jms-empty-hint">暂无 Cookie</p>';
        }
        return list.map(function (c) {
            return '<div class="jms-tg-config-drawer__cookie-row jms-tg-config-drawer__cookie-row--wide">' +
                '<input type="text" class="hf-mono" data-cookie-field="name" placeholder="name" value="' + esc(c.name || '') + '">' +
                '<input type="text" class="hf-mono" data-cookie-field="value" placeholder="value" value="' + esc(c.value || '') + '">' +
                '<input type="text" class="hf-mono" data-cookie-field="domain" placeholder="domain" value="' + esc(c.domain || '') + '">' +
                '<input type="text" class="hf-mono" data-cookie-field="path" placeholder="path" value="' + esc(c.path || '/') + '">' +
                '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cookie-field="secure"' + (c.secure ? ' checked' : '') + '> secure</label>' +
                '<button type="button" class="jms-kv-del jms-tg-config-del-cookie" aria-label="删除">×</button></div>';
        }).join('');
    }

    function renderDefaultsBody(item) {
        if (global.JmsTgHttpDefaultsUi && typeof global.JmsTgHttpDefaultsUi.renderHttpDefaultsBody === 'function') {
            return global.JmsTgHttpDefaultsUi.renderHttpDefaultsBody(item);
        }
        var d = (item && item.data) || Catalog.defaultItemData('http_defaults');
        return '<div class="jms-tg-config-drawer__section">' +
            '<div class="jms-tg-config-drawer__section-title">连接</div>' +
            '<div class="jms-tg-config-drawer__grid">' +
            '<label class="jms-tg-config-drawer__field">协议<input type="text" class="hf-mono" data-cfg-field="protocol" value="' + esc(d.protocol || '') + '" placeholder="https"></label>' +
            '<label class="jms-tg-config-drawer__field">服务器名称<input type="text" class="hf-mono" data-cfg-field="domain" value="' + esc(d.domain || '') + '" placeholder="api.example.com"></label>' +
            '<label class="jms-tg-config-drawer__field">端口号<input type="text" class="hf-mono" data-cfg-field="port" value="' + esc(d.port || '') + '" placeholder="443"></label>' +
            '<label class="jms-tg-config-drawer__field">路径<input type="text" class="hf-mono" data-cfg-field="path" value="' + esc(d.path || '') + '" placeholder="/"></label>' +
            '<label class="jms-tg-config-drawer__field">连接超时 ms<input type="text" class="hf-mono" data-cfg-field="connect_timeout" value="' + esc(d.connect_timeout || '') + '"></label>' +
            '<label class="jms-tg-config-drawer__field">响应超时 ms<input type="text" class="hf-mono" data-cfg-field="response_timeout" value="' + esc(d.response_timeout || '') + '"></label>' +
            '<label class="jms-tg-config-drawer__field">实现<select data-cfg-field="implementation">' +
            '<option value="HttpClient4"' + (d.implementation === 'HttpClient4' || !d.implementation ? ' selected' : '') + '>HttpClient4</option>' +
            '<option value=""' + (!d.implementation ? ' selected' : '') + '>空</option></select></label>' +
            '<label class="jms-tg-config-drawer__field">内容编码<input type="text" class="hf-mono" data-cfg-field="content_encoding" value="' + esc(d.content_encoding || '') + '" placeholder="UTF-8"></label>' +
            '</div>' +
            '<div class="jms-tg-config-drawer__checks-inline">' +
            '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cfg-field="follow_redirects"' + (d.follow_redirects !== false ? ' checked' : '') + '> 跟随重定向</label>' +
            '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cfg-field="auto_redirects"' + (d.auto_redirects ? ' checked' : '') + '> 自动重定向</label>' +
            '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cfg-field="use_keepalive"' + (d.use_keepalive !== false ? ' checked' : '') + '> 使用 KeepAlive</label>' +
            '</div></div>';
    }

    function renderHeadersBody(item) {
        if (global.JmsTgHeaderManagerUi && typeof global.JmsTgHeaderManagerUi.renderHeaderManagerBody === 'function') {
            return global.JmsTgHeaderManagerUi.renderHeaderManagerBody(item);
        }
        var d = (item && item.data) || Catalog.defaultItemData('header_manager');
        return '<div class="jms-tg-config-drawer__grid jms-tg-config-drawer__grid--single">' +
            '<label class="jms-tg-config-drawer__field">名称<input type="text" class="hf-mono" data-cfg-field="name" value="' + esc(d.name || '') + '" placeholder="HTTP 信息头管理器"></label>' +
            '<label class="jms-tg-config-drawer__field">注释<textarea rows="2" class="hf-mono" data-cfg-field="comments" placeholder="可选">' + esc(d.comments || '') + '</textarea></label>' +
            '</div>' +
            '<div class="jms-tg-config-drawer__hdr-head">' +
            '<span class="jms-tg-config-drawer__section-title">信息头存储在信息头管理器中</span>' +
            '<button type="button" class="jms-add-chip jms-tg-config-add-header">+ 请求头</button></div>' +
            '<div class="jms-tg-config-drawer__headers" data-cfg-headers="1">' + renderKvRows(d.headers) + '</div>';
    }

    function renderAuthBody(item) {
        if (global.JmsTgAuthManagerUi && typeof global.JmsTgAuthManagerUi.renderAuthManagerBody === 'function') {
            return global.JmsTgAuthManagerUi.renderAuthManagerBody(item);
        }
        var d = (item && item.data) || Catalog.defaultItemData('auth_manager');
        return '<div class="jms-tg-config-drawer__checks-inline">' +
            '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cfg-field="clear_each_iteration"' + (d.clear_each_iteration === true ? ' checked' : '') + '> Clear auth on each iteration?</label>' +
            '</div>';
    }

    function renderCookieBody(item) {
        if (global.JmsTgCookieManagerUi && typeof global.JmsTgCookieManagerUi.renderCookieManagerBody === 'function') {
            return global.JmsTgCookieManagerUi.renderCookieManagerBody(item);
        }
        var d = (item && item.data) || Catalog.defaultItemData('cookie_manager');
        return '<div class="jms-tg-config-drawer__checks-inline">' +
            '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cfg-field="clear_each_iteration"' + (d.clear_each_iteration !== false ? ' checked' : '') + '> 每次迭代清除 Cookie</label>' +
            '</div>' +
            '<div class="jms-tg-config-drawer__hdr-head">' +
            '<span class="jms-tg-config-drawer__section-title">Cookie 列表</span>' +
            '<button type="button" class="jms-add-chip jms-tg-config-add-cookie">+ Cookie</button></div>' +
            '<div class="jms-tg-config-drawer__cookies" data-cfg-cookies="1">' + renderCookieRows(d.cookies) + '</div>';
    }

    function renderCacheBody(item) {
        if (global.JmsTgCacheManagerUi && typeof global.JmsTgCacheManagerUi.renderCacheManagerBody === 'function') {
            return global.JmsTgCacheManagerUi.renderCacheManagerBody(item);
        }
        var d = (item && item.data) || Catalog.defaultItemData('cache_manager');
        return '<div class="jms-tg-config-drawer__checks-inline">' +
            '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cfg-field="clear_each_iteration"' + (d.clear_each_iteration === true ? ' checked' : '') + '> 每次迭代清除缓存</label>' +
            '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cfg-field="use_expires"' + (d.use_expires !== false ? ' checked' : '') + '> 使用 expires 头</label>' +
            '</div>';
    }

    function renderCsvBody(item) {
        if (global.JmsTgCsvDataSetUi && typeof global.JmsTgCsvDataSetUi.renderCsvDataSetBody === 'function') {
            return global.JmsTgCsvDataSetUi.renderCsvDataSetBody(item);
        }
        var d = (item && item.data) || Catalog.defaultItemData('csv_data_set');
        return '<div class="jms-tg-config-drawer__grid">' +
            '<label class="jms-tg-config-drawer__field" style="grid-column:1/-1">文件名<input type="text" class="hf-mono" data-cfg-field="filename" value="' + esc(d.filename || '') + '" placeholder="data/users.csv"></label>' +
            '</div>';
    }

    function renderCounterBody(item) {
        if (global.JmsTgCounterUi && typeof global.JmsTgCounterUi.renderCounterBody === 'function') {
            return global.JmsTgCounterUi.renderCounterBody(item);
        }
        var d = (item && item.data) || Catalog.defaultItemData('counter');
        return '<div class="jms-tg-config-drawer__grid">' +
            '<label class="jms-tg-config-drawer__field">变量名<input type="text" class="hf-mono" data-cfg-field="variable_name" value="' + esc(d.variable_name || 'counter') + '"></label>' +
            '</div>';
    }

    function renderDrawerBody(typeKey, item) {
        if (typeKey === 'http_defaults') return renderDefaultsBody(item);
        if (typeKey === 'header_manager') return renderHeadersBody(item);
        if (typeKey === 'auth_manager') return renderAuthBody(item);
        if (typeKey === 'cookie_manager') return renderCookieBody(item);
        if (typeKey === 'cache_manager') return renderCacheBody(item);
        if (typeKey === 'csv_data_set') return renderCsvBody(item);
        if (typeKey === 'counter') return renderCounterBody(item);
        return '';
    }

    function drawerUiVersion(typeKey) {
        if (typeKey === 'http_defaults' && global.JmsTgHttpDefaultsUi && global.JmsTgHttpDefaultsUi.UI_VERSION) {
            return String(global.JmsTgHttpDefaultsUi.UI_VERSION);
        }
        if (typeKey === 'header_manager' && global.JmsTgHeaderManagerUi && global.JmsTgHeaderManagerUi.UI_VERSION) {
            return String(global.JmsTgHeaderManagerUi.UI_VERSION);
        }
        if (typeKey === 'auth_manager' && global.JmsTgAuthManagerUi && global.JmsTgAuthManagerUi.UI_VERSION) {
            return String(global.JmsTgAuthManagerUi.UI_VERSION);
        }
        if (typeKey === 'cookie_manager' && global.JmsTgCookieManagerUi && global.JmsTgCookieManagerUi.UI_VERSION) {
            return String(global.JmsTgCookieManagerUi.UI_VERSION);
        }
        if (typeKey === 'cache_manager' && global.JmsTgCacheManagerUi && global.JmsTgCacheManagerUi.UI_VERSION) {
            return String(global.JmsTgCacheManagerUi.UI_VERSION);
        }
        if (typeKey === 'csv_data_set' && global.JmsTgCsvDataSetUi && global.JmsTgCsvDataSetUi.UI_VERSION) {
            return String(global.JmsTgCsvDataSetUi.UI_VERSION);
        }
        if (typeKey === 'counter' && global.JmsTgCounterUi && global.JmsTgCounterUi.UI_VERSION) {
            return String(global.JmsTgCounterUi.UI_VERSION);
        }
        return '1';
    }

    function ensureConfigDrawer(typeKey) {
        var meta = DRAWER_META[typeKey];
        if (!meta) return null;
        var uiVer = drawerUiVersion(typeKey);
        var modal = global.document.getElementById(meta.id);
        if (modal && modal.getAttribute('data-ui-version') === uiVer) return modal;
        if (modal) modal.parentNode.removeChild(modal);

        modal = global.document.createElement('div');
        modal.id = meta.id;
        modal.className = 'jms-modal jms-http-step-config-drawer jms-tg-config-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-config-type', typeKey);
        modal.setAttribute('data-ui-version', uiVer);
        if (typeKey === 'http_defaults') modal.classList.add('jms-tg-hd-v2-drawer');
        if (typeKey === 'header_manager') modal.classList.add('jms-tg-hm-v2-drawer');
        if (typeKey === 'auth_manager') modal.classList.add('jms-tg-am-v2-drawer');
        if (typeKey === 'cookie_manager') modal.classList.add('jms-tg-cm-v2-drawer');
        if (typeKey === 'cache_manager') modal.classList.add('jms-tg-cache-v2-drawer');
        if (typeKey === 'csv_data_set') modal.classList.add('jms-tg-csv-v2-drawer');
        if (typeKey === 'counter') modal.classList.add('jms-tg-counter-v2-drawer');
        modal.innerHTML =
            '<div class="jms-step-modal jms-http-step-config-drawer__panel">' +
            '<div class="jms-http-step-config-drawer__head">' +
            '<span class="jms-http-step-config-drawer__badge">' + esc(meta.badge) + '</span>' +
            '<h3 class="jms-step-modal__title">' + esc(meta.title) + '</h3>' +
            (meta.sub ? '<p class="jms-http-step-config-drawer__sub">' + esc(meta.sub) + '</p>' : '') + '</div>' +
            '<div class="jms-http-step-config-drawer__body jms-tg-config-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-http-step-config-drawer__foot">' +
            '<button type="button" class="jms-btn-ghost jms-tg-config-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-config-drawer__save">保存</button></div></div>';

        global.document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal) closeDrawer(modal);
        });
        modal.querySelector('.jms-tg-config-drawer__cancel').addEventListener('click', function () {
            closeDrawer(modal);
        });
        modal.querySelector('.jms-tg-config-drawer__save').addEventListener('click', function () {
            saveDrawer(modal);
        });
        modal.querySelector('.jms-tg-config-drawer__body').addEventListener('change', function (ev) {
            if (global.JmsTgCsvDataSetUi) return;
            var upload = ev.target.closest('.jms-tg-config-csv-upload');
            if (!upload || !upload.files || !upload.files[0]) return;
            var reader = new global.FileReader();
            reader.onload = function () {
                var fn = modal.querySelector('[data-cfg-field="filename"]');
                if (fn && !fn.value.trim()) fn.value = upload.files[0].name;
            };
            reader.readAsText(upload.files[0]);
        });
        return modal;
    }

    function ensureAllDrawers() {
        if (!Catalog) return;
        Catalog.CONFIG_KEYS.forEach(function (k) { ensureConfigDrawer(k); });
    }

    function closeDrawer(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-plan-id');
        modal.removeAttribute('data-tg-id');
        modal.removeAttribute('data-item-id');
    }

    function closeAllDrawers() {
        if (!Catalog) return;
        Catalog.CONFIG_KEYS.forEach(function (k) {
            var meta = DRAWER_META[k];
            if (meta) closeDrawer(global.document.getElementById(meta.id));
        });
    }

    function readKvFromBody(body) {
        var out = [];
        body.querySelectorAll('.jms-tg-config-drawer__kv-row').forEach(function (row) {
            var k = row.querySelector('.jms-kv-key');
            var v = row.querySelector('.jms-kv-val');
            var key = k ? k.value.trim() : '';
            if (key) out.push({ key: key, value: v ? v.value : '' });
        });
        return out;
    }

    function readCookiesFromBody(body) {
        var out = [];
        body.querySelectorAll('.jms-tg-config-drawer__cookie-row').forEach(function (row) {
            var nameEl = row.querySelector('[data-cookie-field="name"]');
            var name = nameEl ? nameEl.value.trim() : '';
            if (!name) return;
            out.push({
                name: name,
                value: (row.querySelector('[data-cookie-field="value"]') || {}).value || '',
                domain: (row.querySelector('[data-cookie-field="domain"]') || {}).value || '',
                path: (row.querySelector('[data-cookie-field="path"]') || {}).value || '/',
                secure: !!((row.querySelector('[data-cookie-field="secure"]') || {}).checked),
                expires: ''
            });
        });
        return out;
    }

    function readItemFromDrawer(typeKey, body, priorItem) {
        var raw = { type: typeKey, data: Catalog.defaultItemData(typeKey) };
        if (typeKey === 'http_defaults') {
            if (global.JmsTgHttpDefaultsUi && typeof global.JmsTgHttpDefaultsUi.readHttpDefaultsFromBody === 'function') {
                raw.data = global.JmsTgHttpDefaultsUi.readHttpDefaultsFromBody(body, priorItem && priorItem.data);
            } else {
                body.querySelectorAll('[data-cfg-field]').forEach(function (el) {
                    var f = el.getAttribute('data-cfg-field');
                    if (el.type === 'checkbox') raw.data[f] = !!el.checked;
                    else raw.data[f] = el.value.trim();
                });
            }
        } else if (typeKey === 'header_manager') {
            if (global.JmsTgHeaderManagerUi && typeof global.JmsTgHeaderManagerUi.readHeaderManagerFromBody === 'function') {
                raw.data = global.JmsTgHeaderManagerUi.readHeaderManagerFromBody(body, priorItem && priorItem.data);
            } else {
                raw.data.name = (body.querySelector('[data-cfg-field="name"]') || {}).value || '';
                raw.data.name = raw.data.name.trim();
                raw.data.comments = (body.querySelector('[data-cfg-field="comments"]') || {}).value || '';
                raw.data.headers = readKvFromBody(body);
            }
        } else if (typeKey === 'auth_manager') {
            if (global.JmsTgAuthManagerUi && typeof global.JmsTgAuthManagerUi.readAuthManagerFromBody === 'function') {
                raw.data = global.JmsTgAuthManagerUi.readAuthManagerFromBody(body, priorItem && priorItem.data);
            } else {
                raw.data.clear_each_iteration = !!((body.querySelector('[data-cfg-field="clear_each_iteration"]') || {}).checked);
                raw.data.authorizations = [];
            }
        } else if (typeKey === 'cookie_manager') {
            if (global.JmsTgCookieManagerUi && typeof global.JmsTgCookieManagerUi.readCookieManagerFromBody === 'function') {
                raw.data = global.JmsTgCookieManagerUi.readCookieManagerFromBody(body, priorItem && priorItem.data);
            } else {
                raw.data.clear_each_iteration = !!((body.querySelector('[data-cfg-field="clear_each_iteration"]') || {}).checked);
                var policyEl = body.querySelector('[data-cfg-field="cookie_policy"]');
                if (policyEl) {
                    raw.data.cookie_policy = global.JmsTgCookieManagerJmx && global.JmsTgCookieManagerJmx.normalizeCookiePolicy
                        ? global.JmsTgCookieManagerJmx.normalizeCookiePolicy(policyEl.value)
                        : policyEl.value;
                }
                raw.data.cookies = readCookiesFromBody(body);
            }
        } else if (typeKey === 'cache_manager') {
            if (global.JmsTgCacheManagerUi && typeof global.JmsTgCacheManagerUi.readCacheManagerFromBody === 'function') {
                raw.data = global.JmsTgCacheManagerUi.readCacheManagerFromBody(body, priorItem && priorItem.data);
            } else {
                raw.data.clear_each_iteration = !!((body.querySelector('[data-cfg-field="clear_each_iteration"]') || {}).checked);
                raw.data.use_expires = !!((body.querySelector('[data-cfg-field="use_expires"]') || {}).checked);
            }
        } else if (typeKey === 'csv_data_set') {
            if (global.JmsTgCsvDataSetUi && typeof global.JmsTgCsvDataSetUi.readCsvDataSetFromBody === 'function') {
                raw.data = global.JmsTgCsvDataSetUi.readCsvDataSetFromBody(body, priorItem && priorItem.data);
            } else {
                body.querySelectorAll('[data-cfg-field]').forEach(function (el) {
                    var f = el.getAttribute('data-cfg-field');
                    if (el.type === 'checkbox') raw.data[f] = !!el.checked;
                    else if (f === 'file_content') raw.data[f] = el.value;
                    else raw.data[f] = el.value.trim();
                });
            }
        } else if (typeKey === 'counter') {
            if (global.JmsTgCounterUi && typeof global.JmsTgCounterUi.readCounterFromBody === 'function') {
                raw.data = global.JmsTgCounterUi.readCounterFromBody(body, priorItem && priorItem.data);
            } else {
                body.querySelectorAll('[data-cfg-field]').forEach(function (el) {
                    var f = el.getAttribute('data-cfg-field');
                    if (el.type === 'checkbox') raw.data[f] = !!el.checked;
                    else raw.data[f] = el.value.trim();
                });
            }
        }
        return Catalog.normalizeItem(raw);
    }

    function openDrawer(planId, tgId, typeKey, itemId) {
        if (!Catalog || !DRAWER_META[typeKey]) return;
        var tg = findTg(getModel(), planId, tgId);
        if (!tg) return;
        var item = itemId ? findItem(tg, itemId) : null;
        if (itemId && !item) return;
        var modal = ensureConfigDrawer(typeKey);
        if (!modal) return;
        closeAllDrawers();
        if (global.JmsTgConfigMenuUi && typeof global.JmsTgConfigMenuUi.closeAllMenus === 'function') {
            global.JmsTgConfigMenuUi.closeAllMenus();
        }
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        if (itemId) modal.setAttribute('data-item-id', itemId);
        else modal.removeAttribute('data-item-id');
        var bodyEl = modal.querySelector('.jms-tg-config-drawer__body');
        if (bodyEl) bodyEl.innerHTML = renderDrawerBody(typeKey, item);
        if (typeKey === 'http_defaults' && global.JmsTgHttpDefaultsUi && typeof global.JmsTgHttpDefaultsUi.afterRender === 'function') {
            global.JmsTgHttpDefaultsUi.afterRender(bodyEl);
        }
        if (typeKey === 'csv_data_set' && global.JmsTgCsvDataSetUi && typeof global.JmsTgCsvDataSetUi.afterRender === 'function') {
            global.JmsTgCsvDataSetUi.afterRender(modal, item && item.data);
        }
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
        var firstInput = modal.querySelector('input:not([type="checkbox"]):not([type="file"])');
        if (firstInput) setTimeout(function () { firstInput.focus(); }, 80);
    }

    function saveDrawer(modal) {
        if (!Catalog || !modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var itemId = modal.getAttribute('data-item-id');
        var typeKey = modal.getAttribute('data-config-type');
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !typeKey) return;
        var bodyEl = modal.querySelector('.jms-tg-config-drawer__body');
        if (!bodyEl) return;
        var priorItem = itemId ? findItem(tg, itemId) : null;
        var item = readItemFromDrawer(typeKey, bodyEl, priorItem);
        if (!Catalog.isPersistable(item)) {
            if (itemId) {
                tg.config_items = ensureItems(tg).filter(function (it) { return it.id !== itemId; });
                if (priorItem) applyConfigItemRemoval(tg, priorItem);
            }
            closeDrawer(modal);
            markDirtyAndSync(planId, tgId);
            return;
        }
        var items = ensureItems(tg);
        if (itemId) {
            var idx = items.findIndex(function (it) { return it.id === itemId; });
            if (idx >= 0) {
                item.id = itemId;
                item.name = Catalog.itemSummary(item);
                items[idx] = item;
            }
        } else {
            item.id = Catalog.uid();
            item.name = Catalog.itemSummary(item);
            items.push(item);
            if (global.JmsTgTopLevelAppend && typeof global.JmsTgTopLevelAppend.assignOrder === 'function') {
                global.JmsTgTopLevelAppend.assignOrder(tg, item);
            } else if (global.JmsTgDetailTimeline &&
                typeof global.JmsTgDetailTimeline.assignAppendTimelineOrder === 'function') {
                global.JmsTgDetailTimeline.assignAppendTimelineOrder(tg, item);
            }
        }
        closeDrawer(modal);
        markDirtyAndSync(planId, tgId);
    }

    function confirmDeleteConfigItem(label) {
        var ConfirmUi = global.JmsConfigDeleteConfirmUi;
        if (ConfirmUi && typeof ConfirmUi.confirm === 'function') {
            return ConfirmUi.confirm({ name: label });
        }
        return Promise.resolve(global.confirm('确定删除配置元件「' + label + '」吗？'));
    }

    function deleteItem(planId, tgId, itemId) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !itemId) return;
        var item = findItem(tg, itemId);
        if (!item) return;
        var label = item.name || Catalog.itemSummary(item) || item.type;
        confirmDeleteConfigItem(label).then(function (ok) {
            if (!ok) return;
            tg.config_items = ensureItems(tg).filter(function (it) { return it.id !== itemId; });
            applyConfigItemRemoval(tg, item);
            markDirtyAndSync(planId, tgId);
        });
    }


    function renderConfigDragHandle(planId, tgId, configId) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-config-id="' + esc(configId) + '" data-parent-step-id="">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function resolveConfigCardEnable(planId, tgId, item) {
        var type = item.type;
        var enabled = true;
        var toggle = '';
        var cardClass = '';
        var MgrUi = global.JmsMgrConfigEnableUi;
        var CtrUi = global.JmsCounterConfigEnableUi;
        if (type === 'counter' && CtrUi && typeof CtrUi.isEnabled === 'function') {
            enabled = CtrUi.isEnabled(item.data);
            if (typeof CtrUi.renderCardToggle === 'function') {
                toggle = CtrUi.renderCardToggle('tg', {
                    'plan-id': planId,
                    'tg-id': tgId,
                    'config-id': item.id
                }, enabled);
            }
            cardClass = ' jms-aux-card--tg-config-counter';
        } else if (MgrUi && typeof MgrUi.supportsType === 'function' && MgrUi.supportsType(type)) {
            enabled = MgrUi.isEnabled(item.data);
            if (typeof MgrUi.renderCardToggle === 'function') {
                toggle = MgrUi.renderCardToggle('tg', type, {
                    'plan-id': planId,
                    'tg-id': tgId,
                    'config-id': item.id
                }, enabled);
            }
            cardClass = typeof MgrUi.getTgCardClass === 'function' ? MgrUi.getTgCardClass(type) : '';
        }
        return {
            enabled: enabled,
            toggle: toggle,
            cardClass: cardClass,
            disabledClass: !enabled ? ' is-disabled' : ''
        };
    }

    function composeConfigCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function renderConfigRow(planId, tgId, item) {
        var typeLabel = Catalog.LABELS[item.type] || item.type;
        var summary = item.name || Catalog.itemSummary(item);
        var isNested = item.parent_step_id;
        var depth = isNested ? 1 : 0;
        var nestedClass = isNested ? ' jms-tree-node--config-nested' : '';
        var enableUi = resolveConfigCardEnable(planId, tgId, item);
        return '<div class="jms-tree-node jms-tree-node--config' + nestedClass + '" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';" data-config-id="' + esc(item.id) + '">' +
            renderConfigDragHandle(planId, tgId, item.id) +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--tg-config' + enableUi.cardClass + enableUi.disabledClass + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-config-id="' + esc(item.id) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">C</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">' + esc(typeLabel) + '</span>' +
            '<span class="jms-aux-name" title="' + esc(summary) + '">' + esc(summary) + '</span>' +
            '</div>' +
            composeConfigCardToolbar(enableUi.toggle,
            '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="配置元件操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost jms-btn-edit-tg-config" role="menuitem" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-config-id="' + esc(item.id) + '" data-config-type="' + esc(item.type) + '">编辑</button>' +
            '<button type="button" class="jms-btn-ghost jms-btn-del-tg-config" role="menuitem" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-config-id="' + esc(item.id) + '">删除</button>' +
            '</div></div>') +
            '</div></div></div>';
    }

    function renderConfigNodes(planId, tg) {
        if (!Catalog || !tg) return '';
        var items = ensureItems(tg).filter(function (it) { return it && Catalog.isPersistable(it); });
        if (!items.length) return '';
        return items.map(function (item) {
            return renderConfigRow(planId, tg.id, item);
        }).join('');
    }

    function onDrawerBodyClick(ev) {
        var t = ev.target;
        var body = t.closest('.jms-tg-config-drawer__body');
        if (!body) return;
        if (t.classList.contains('jms-tg-config-add-header')) {
            ev.preventDefault();
            ev.stopPropagation();
            var list = body.querySelector('[data-cfg-headers]');
            if (!list) return;
            var empty = list.querySelector('.jms-empty-hint');
            if (empty) empty.remove();
            var row = global.document.createElement('div');
            row.className = 'jms-kv-row jms-tg-config-drawer__kv-row';
            row.innerHTML = '<input type="text" class="jms-kv-key hf-mono" placeholder="Header 名">' +
                '<input type="text" class="jms-kv-val hf-mono" placeholder="值">' +
                '<span></span><button type="button" class="jms-kv-del" aria-label="删除">×</button>';
            list.appendChild(row);
            row.querySelector('.jms-kv-key').focus();
            return;
        }
        if (t.classList.contains('jms-tg-config-add-cookie')) {
            ev.preventDefault();
            ev.stopPropagation();
            var clist = body.querySelector('[data-cfg-cookies]');
            if (!clist) return;
            var empty2 = clist.querySelector('.jms-empty-hint');
            if (empty2) empty2.remove();
            var crow = global.document.createElement('div');
            crow.className = 'jms-tg-config-drawer__cookie-row jms-tg-config-drawer__cookie-row--wide';
            crow.innerHTML = '<input type="text" class="hf-mono" data-cookie-field="name" placeholder="name">' +
                '<input type="text" class="hf-mono" data-cookie-field="value" placeholder="value">' +
                '<input type="text" class="hf-mono" data-cookie-field="domain" placeholder="domain">' +
                '<input type="text" class="hf-mono" data-cookie-field="path" placeholder="path" value="/">' +
                '<label class="jms-tg-config-drawer__check"><input type="checkbox" data-cookie-field="secure"> secure</label>' +
                '<button type="button" class="jms-kv-del jms-tg-config-del-cookie" aria-label="删除">×</button>';
            clist.appendChild(crow);
            crow.querySelector('[data-cookie-field="name"]').focus();
            return;
        }
        if (t.classList.contains('jms-kv-del') && (t.closest('[data-cfg-headers]') || t.closest('[data-cfg-cookies]'))) {
            ev.preventDefault();
            ev.stopPropagation();
            var kvRow = t.closest('.jms-kv-row, .jms-tg-config-drawer__cookie-row');
            if (kvRow) kvRow.remove();
        }
    }

    function onRootClick(ev) {
        if (!isTreeView() || !Catalog) return;
        var t = ev.target;

        var editBtn = t.closest('.jms-btn-edit-tg-config');
        if (editBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var actions = editBtn.closest('.lth-step-actions');
            if (actions) actions.classList.remove('is-open', 'is-hover');
            openDrawer(
                editBtn.getAttribute('data-plan-id'),
                editBtn.getAttribute('data-tg-id'),
                editBtn.getAttribute('data-config-type'),
                editBtn.getAttribute('data-config-id')
            );
            return;
        }

        var delBtn = t.closest('.jms-btn-del-tg-config');
        if (delBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var actions2 = delBtn.closest('.lth-step-actions');
            if (actions2) actions2.classList.remove('is-open', 'is-hover');
            deleteItem(
                delBtn.getAttribute('data-plan-id'),
                delBtn.getAttribute('data-tg-id'),
                delBtn.getAttribute('data-config-id')
            );
            return;
        }

        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.handleToggleClick === 'function' &&
            global.JmsMgrConfigEnableUi.handleToggleClick(ev)) {
            return;
        }

        if (global.JmsCounterConfigEnableUi &&
            typeof global.JmsCounterConfigEnableUi.handleToggleClick === 'function' &&
            global.JmsCounterConfigEnableUi.handleToggleClick(ev)) {
            return;
        }
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgConfigUiBound === '1') return;
        root.dataset.jmsTgConfigUiBound = '1';
        ensureAllDrawers();
        if (global.JmsTgHttpDefaultsUi && typeof global.JmsTgHttpDefaultsUi.bind === 'function') {
            global.JmsTgHttpDefaultsUi.bind();
        }
        if (global.JmsTgHeaderManagerUi && typeof global.JmsTgHeaderManagerUi.bind === 'function') {
            global.JmsTgHeaderManagerUi.bind();
        }
        if (global.JmsTgAuthManagerUi && typeof global.JmsTgAuthManagerUi.bind === 'function') {
            global.JmsTgAuthManagerUi.bind();
        }
        if (global.JmsTgCookieManagerUi && typeof global.JmsTgCookieManagerUi.bind === 'function') {
            global.JmsTgCookieManagerUi.bind();
        }
        if (global.JmsTgCacheManagerUi && typeof global.JmsTgCacheManagerUi.bind === 'function') {
            global.JmsTgCacheManagerUi.bind();
        }
        if (global.JmsTgCsvDataSetUi && typeof global.JmsTgCsvDataSetUi.bind === 'function') {
            global.JmsTgCsvDataSetUi.bind();
        }
        if (global.JmsTgCounterUi && typeof global.JmsTgCounterUi.bind === 'function') {
            global.JmsTgCounterUi.bind();
        }
        global.document.addEventListener('click', onDrawerBodyClick, true);
        root.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgConfigUi = {
        renderConfigNodes: renderConfigNodes,
        renderConfigRow: renderConfigRow,
        openDrawer: openDrawer,
        closeAllDrawers: closeAllDrawers,
        markDirtyAndSync: markDirtyAndSync,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
