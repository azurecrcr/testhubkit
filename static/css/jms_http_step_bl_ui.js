/**
 * HTTP 步骤 · 后端监听器弹窗 UI（隔离模块 v1 · modal-http-step-bl）
 * 布局对齐线程组循环控制器抽屉，样式独立实现；功能对齐 TG 后端监听器参数编辑。
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-http-step-bl';
    var UI_VERSION = '1';
    var LISTENER_TYPE = 'backend_listener';
    var BlCat = global.JmsBackendListenerCatalog;
    var StepCatalog = global.JmsHttpStepListenerCatalog;

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
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

    function findStepInList(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (s.id === stepId) { found = s; return true; }
            if (s.type === 'if_controller' && s.children) {
                found = findStepInList(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function findHttpStep(model, planId, tgId, stepId) {
        var tg = findTg(model, planId, tgId);
        if (!tg || !stepId) return null;
        var step = findStepInList(tg.steps, stepId);
        if (!step || !step.method) return null;
        return step;
    }

    function renderImplOptions(selected) {
        return (BlCat.IMPLEMENTATIONS || []).map(function (opt) {
            var sel = opt.value === selected ? ' selected' : '';
            return '<option value="' + esc(opt.value) + '"' + sel + '>' + esc(opt.label) + '</option>';
        }).join('');
    }

    function renderParamRows(params) {
        params = params || [];
        if (!params.length) {
            return '<div class="jms-http-step-bl-v1__empty">暂无参数，点击下方「添加」</div>';
        }
        return params.map(function (row, i) {
            return '<div class="jms-http-step-bl-v1__row" data-kv-index="' + i + '" tabindex="0" role="row">' +
                '<input type="text" class="jms-http-step-bl-v1__cell jms-http-step-bl-v1__cell--key hf-mono" data-http-step-bl-field="key" placeholder="名称" value="' + esc(row.key || '') + '">' +
                '<input type="text" class="jms-http-step-bl-v1__cell jms-http-step-bl-v1__cell--val hf-mono" data-http-step-bl-field="value" placeholder="值" value="' + esc(row.value || '') + '">' +
                '</div>';
        }).join('');
    }

    function normalizeDraft(item) {
        if (item) {
            return BlCat.normalizeConfig({
                name: item.name,
                comments: item.comments,
                classname: item.classname,
                queue_size: item.queue_size,
                parameters: item.parameters,
                enabled: item.enabled !== false
            });
        }
        return BlCat.normalizeConfig(BlCat.defaultConfig());
    }

    function renderBody(cfg) {
        cfg = BlCat.normalizeConfig(cfg);
        return '<div class="jms-http-step-bl-v1" data-http-step-bl-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-http-step-bl-v1__meta">' +
            '<label class="jms-http-step-bl-v1__inline jms-http-step-bl-v1__inline--name">' +
            '<span class="jms-http-step-bl-v1__inline-label">名称</span>' +
            '<input type="text" class="jms-http-step-bl-v1__input" data-http-step-bl-field="name" value="' + esc(cfg.name || '') + '" placeholder="后端监听器">' +
            '</label>' +
            '<label class="jms-http-step-bl-v1__inline jms-http-step-bl-v1__inline--comments">' +
            '<span class="jms-http-step-bl-v1__inline-label">注释</span>' +
            '<input type="text" class="jms-http-step-bl-v1__input" data-http-step-bl-field="comments" value="' + esc(cfg.comments || '') + '" placeholder="可选">' +
            '</label></div>' +
            '<label class="jms-http-step-bl-v1__field">' +
            '<span class="jms-http-step-bl-v1__field-label">后端监听器实现</span>' +
            '<select class="jms-http-step-bl-v1__select hf-mono" data-http-step-bl-field="classname">' + renderImplOptions(cfg.classname) + '</select>' +
            '</label>' +
            '<label class="jms-http-step-bl-v1__field jms-http-step-bl-v1__field--queue">' +
            '<span class="jms-http-step-bl-v1__field-label">异步队列大小</span>' +
            '<input type="text" class="jms-http-step-bl-v1__input jms-http-step-bl-v1__input--queue hf-mono" data-http-step-bl-field="queue_size" value="' + esc(cfg.queue_size || '5000') + '" placeholder="5000">' +
            '</label>' +
            '<section class="jms-http-step-bl-v1__params">' +
            '<div class="jms-http-step-bl-v1__params-title">参数</div>' +
            '<div class="jms-http-step-bl-v1__table">' +
            '<div class="jms-http-step-bl-v1__thead" role="row">' +
            '<span class="jms-http-step-bl-v1__th">名称</span><span class="jms-http-step-bl-v1__th">值</span></div>' +
            '<div class="jms-http-step-bl-v1__tbody" data-http-step-bl-params>' + renderParamRows(cfg.parameters) + '</div></div>' +
            '<div class="jms-http-step-bl-v1__detail" data-http-step-bl-detail hidden>' +
            '<span class="jms-http-step-bl-v1__detail-label">参数详情</span>' +
            '<textarea class="jms-http-step-bl-v1__detail-area hf-mono" data-http-step-bl-detail-val rows="3" placeholder="选中一行后可在此编辑完整值"></textarea>' +
            '</div>' +
            '<div class="jms-http-step-bl-v1__toolbar">' +
            '<button type="button" class="jms-http-step-bl-v1__tool" data-http-step-bl-action="detail">详细</button>' +
            '<button type="button" class="jms-http-step-bl-v1__tool" data-http-step-bl-action="add">添加</button>' +
            '<button type="button" class="jms-http-step-bl-v1__tool" data-http-step-bl-action="paste">从剪贴板添加</button>' +
            '<button type="button" class="jms-http-step-bl-v1__tool" data-http-step-bl-action="delete">删除</button>' +
            '<button type="button" class="jms-http-step-bl-v1__tool" data-http-step-bl-action="up">向上</button>' +
            '<button type="button" class="jms-http-step-bl-v1__tool" data-http-step-bl-action="down">向下</button>' +
            '</div></section>' +
            '<div class="jms-http-step-bl-v1__bar">' +
            '<span class="jms-http-step-bl-v1__bar-label">监听器状态</span>' +
            '<label class="jms-http-step-bl-v1__enabled">' +
            '<input type="checkbox" data-http-step-bl-field="enabled"' + (cfg.enabled !== false ? ' checked' : '') + '>' +
            '<span>启用</span></label></div></div>';
    }

    function getParamsRoot(body) {
        return body ? body.querySelector('[data-http-step-bl-params]') : null;
    }

    function getSelectedRow(body) {
        var root = getParamsRoot(body);
        return root ? root.querySelector('.jms-http-step-bl-v1__row.is-selected') : null;
    }

    function selectRow(body, row) {
        var root = getParamsRoot(body);
        if (!root) return;
        root.querySelectorAll('.jms-http-step-bl-v1__row.is-selected').forEach(function (r) {
            r.classList.remove('is-selected');
        });
        if (row) {
            row.classList.add('is-selected');
            syncDetailFromRow(body, row);
        }
    }

    function syncDetailFromRow(body, row) {
        var detail = body.querySelector('[data-http-step-bl-detail-val]');
        if (!detail || !row) return;
        var val = row.querySelector('[data-http-step-bl-field="value"]');
        detail.value = val ? val.value : '';
    }

    function appendParamRow(body, key, value) {
        var root = getParamsRoot(body);
        if (!root) return;
        var empty = root.querySelector('.jms-http-step-bl-v1__empty');
        if (empty) empty.remove();
        var row = global.document.createElement('div');
        row.className = 'jms-http-step-bl-v1__row';
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'row');
        row.innerHTML =
            '<input type="text" class="jms-http-step-bl-v1__cell jms-http-step-bl-v1__cell--key hf-mono" data-http-step-bl-field="key" placeholder="名称" value="' + esc(key || '') + '">' +
            '<input type="text" class="jms-http-step-bl-v1__cell jms-http-step-bl-v1__cell--val hf-mono" data-http-step-bl-field="value" placeholder="值" value="' + esc(value || '') + '">';
        root.appendChild(row);
        selectRow(body, row);
        var keyInput = row.querySelector('[data-http-step-bl-field="key"]');
        if (keyInput) keyInput.focus();
    }

    function parseClipboardLines(text) {
        var out = [];
        String(text || '').split(/\r?\n/).forEach(function (line) {
            line = line.trim();
            if (!line) return;
            var tab = line.indexOf('\t');
            if (tab >= 0) {
                out.push({ key: line.slice(0, tab).trim(), value: line.slice(tab + 1) });
                return;
            }
            var eq = line.indexOf('=');
            if (eq >= 0) {
                out.push({ key: line.slice(0, eq).trim(), value: line.slice(eq + 1) });
                return;
            }
            out.push({ key: line, value: '' });
        });
        return out;
    }

    function readParamsFromDom(body) {
        var out = [];
        var root = getParamsRoot(body);
        if (!root) return out;
        root.querySelectorAll('.jms-http-step-bl-v1__row').forEach(function (row) {
            var k = row.querySelector('[data-http-step-bl-field="key"]');
            var v = row.querySelector('[data-http-step-bl-field="value"]');
            var key = k ? k.value.trim() : '';
            if (key) out.push({ key: key, value: v ? v.value : '' });
        });
        return out;
    }

    function bindBodyInteractions(modal) {
        var body = modal.querySelector('.jms-http-step-bl-drawer__body');
        if (!body || body.dataset.httpStepBlBound === '1') return;
        body.dataset.httpStepBlBound = '1';
        var clsSel = body.querySelector('[data-http-step-bl-field="classname"]');
        body._prevClassname = clsSel ? clsSel.value : '';

        body.addEventListener('click', function (ev) {
            var row = ev.target.closest('.jms-http-step-bl-v1__row');
            if (row && getParamsRoot(body) && getParamsRoot(body).contains(row)) {
                selectRow(body, row);
            }
            var btn = ev.target.closest('[data-http-step-bl-action]');
            if (!btn) return;
            var action = btn.getAttribute('data-http-step-bl-action');
            if (action === 'add') {
                appendParamRow(body, '', '');
                return;
            }
            if (action === 'delete') {
                var sel = getSelectedRow(body);
                if (sel) {
                    var next = sel.nextElementSibling || sel.previousElementSibling;
                    sel.remove();
                    if (next && next.classList.contains('jms-http-step-bl-v1__row')) selectRow(body, next);
                    if (!getParamsRoot(body).querySelector('.jms-http-step-bl-v1__row')) {
                        getParamsRoot(body).innerHTML = '<div class="jms-http-step-bl-v1__empty">暂无参数，点击下方「添加」</div>';
                    }
                }
                return;
            }
            if (action === 'up' || action === 'down') {
                var cur = getSelectedRow(body);
                if (!cur || !cur.parentNode) return;
                if (action === 'up' && cur.previousElementSibling) {
                    cur.parentNode.insertBefore(cur, cur.previousElementSibling);
                } else if (action === 'down' && cur.nextElementSibling) {
                    cur.parentNode.insertBefore(cur.nextElementSibling, cur);
                }
                return;
            }
            if (action === 'detail') {
                var panel = body.querySelector('[data-http-step-bl-detail]');
                var selRow = getSelectedRow(body);
                if (!panel) return;
                if (!selRow) {
                    panel.setAttribute('hidden', '');
                    btn.classList.remove('is-open');
                    btn.setAttribute('aria-expanded', 'false');
                    return;
                }
                var open = panel.hasAttribute('hidden');
                if (open) {
                    panel.removeAttribute('hidden');
                    syncDetailFromRow(body, selRow);
                } else {
                    panel.setAttribute('hidden', '');
                }
                btn.classList.toggle('is-open', open);
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                return;
            }
            if (action === 'paste') {
                if (!global.navigator.clipboard || !global.navigator.clipboard.readText) {
                    appendParamRow(body, '', '');
                    return;
                }
                global.navigator.clipboard.readText().then(function (text) {
                    var rows = parseClipboardLines(text);
                    if (!rows.length) appendParamRow(body, '', '');
                    else rows.forEach(function (r) { appendParamRow(body, r.key, r.value); });
                }).catch(function () {
                    appendParamRow(body, '', '');
                });
            }
        });

        body.addEventListener('input', function (ev) {
            if (ev.target.matches('[data-http-step-bl-detail-val]')) {
                var sel = getSelectedRow(body);
                if (!sel) return;
                var val = sel.querySelector('[data-http-step-bl-field="value"]');
                if (val) val.value = ev.target.value;
            }
        });

        if (clsSel) {
            clsSel.addEventListener('change', function () {
                var prev = body._prevClassname || clsSel.value;
                var next = clsSel.value;
                var curParams = readParamsFromDom(body);
                var prevDefaults = BlCat.defaultParamsForClassname(prev);
                if (BlCat.paramsEqual(curParams, prevDefaults) || !curParams.length) {
                    getParamsRoot(body).innerHTML = renderParamRows(BlCat.defaultParamsForClassname(next));
                }
                body._prevClassname = next;
            });
        }
    }

    function readForm(modal) {
        var body = modal.querySelector('.jms-http-step-bl-drawer__body');
        function field(name) {
            var el = body.querySelector('[data-http-step-bl-field="' + name + '"]');
            return el ? el.value : '';
        }
        function checked(name) {
            var el = body.querySelector('[data-http-step-bl-field="' + name + '"]');
            return el ? !!el.checked : false;
        }
        return BlCat.normalizeConfig({
            name: field('name').trim() || '后端监听器',
            comments: field('comments'),
            classname: field('classname'),
            queue_size: field('queue_size').trim() || '5000',
            parameters: readParamsFromDom(body),
            enabled: checked('enabled')
        });
    }

    function markDirtyAndRefresh(planId) {
        if (global.JmsHttpStepListenersUi && typeof global.JmsHttpStepListenersUi.refreshAfterSave === 'function') {
            global.JmsHttpStepListenersUi.refreshAfterSave(planId);
        }
    }

    function hideModal(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-plan-id');
        modal.removeAttribute('data-tg-id');
        modal.removeAttribute('data-step-id');
        modal.removeAttribute('data-edit-mode');
        modal.removeAttribute('data-listener-index');
    }

    function cancelModal() {
        hideModal(global.document.getElementById(MODAL_ID));
    }

    function ensureModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-http-step-bl-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-http-step-bl-drawer__panel">' +
            '<div class="jms-http-step-bl-drawer__head">' +
            '<div class="jms-http-step-bl-drawer__head-main">' +
            '<span class="jms-http-step-bl-drawer__badge">Backend Listener</span>' +
            '<h3 class="jms-step-modal__title" data-http-step-bl-modal-title>后端监听器</h3>' +
            '</div>' +
            '<button type="button" class="jms-http-step-bl-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-http-step-bl-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-http-step-bl-drawer__foot">' +
            '<button type="button" class="jms-btn-ghost jms-http-step-bl-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-http-step-bl-drawer__save">保存</button>' +
            '</div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal) cancelModal();
        });
        var panel = modal.querySelector('.jms-http-step-bl-drawer__panel');
        if (panel) panel.addEventListener('click', function (ev) { ev.stopPropagation(); });
        modal.querySelector('.jms-http-step-bl-drawer__close').addEventListener('click', cancelModal);
        modal.querySelector('.jms-http-step-bl-drawer__cancel').addEventListener('click', cancelModal);
        modal.querySelector('.jms-http-step-bl-drawer__save').addEventListener('click', saveFromModal);
        if (!global.document.body.dataset.jmsHttpStepBlEscBound) {
            global.document.body.dataset.jmsHttpStepBlEscBound = '1';
            global.document.addEventListener('keydown', function (ev) {
                if (ev.key !== 'Escape') return;
                var m = global.document.getElementById(MODAL_ID);
                if (m && m.classList.contains('jms-modal-open')) cancelModal();
            });
        }
        return modal;
    }

    function openEditor(planId, tgId, stepId, index, mode) {
        if (!BlCat || !StepCatalog) return;
        var step = findHttpStep(getModel(), planId, tgId, stepId);
        if (!step) return;
        var items = StepCatalog.ensureStepListenerItems(step);
        var item = null;
        var title = mode === 'edit' ? '编辑后端监听器' : '添加后端监听器';
        if (mode === 'edit') {
            item = items[index];
            if (!item || item.type !== LISTENER_TYPE) return;
        }
        var draft = normalizeDraft(item);
        if (mode === 'create') {
            draft.name = StepCatalog.defaultListenerName(LISTENER_TYPE, items.length);
            draft.enabled = true;
        }
        var modal = ensureModal();
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-step-id', stepId);
        modal.setAttribute('data-edit-mode', mode);
        if (mode === 'edit') modal.setAttribute('data-listener-index', String(index));
        else modal.removeAttribute('data-listener-index');
        var titleEl = modal.querySelector('[data-http-step-bl-modal-title]');
        if (titleEl) titleEl.textContent = title;
        var bodyEl = modal.querySelector('.jms-http-step-bl-drawer__body');
        if (bodyEl) {
            bodyEl.innerHTML = renderBody(draft);
            bodyEl.removeAttribute('data-http-step-bl-bound');
            bindBodyInteractions(modal);
        }
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
        var first = modal.querySelector('[data-http-step-bl-field="name"]');
        if (first) {
            global.setTimeout(function () {
                try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
            }, 60);
        }
    }

    function saveFromModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal || !StepCatalog || !BlCat) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var mode = modal.getAttribute('data-edit-mode');
        var step = findHttpStep(getModel(), planId, tgId, stepId);
        if (!step) return;
        var cfg = readForm(modal);
        var items = StepCatalog.ensureStepListenerItems(step);
        if (mode === 'create') {
            var item = StepCatalog.defaultListenerItem(LISTENER_TYPE, items.length);
            item.name = cfg.name;
            item.comments = cfg.comments || '';
            item.enabled = cfg.enabled !== false;
            item.classname = cfg.classname;
            item.queue_size = cfg.queue_size;
            item.parameters = cfg.parameters;
            items.push(item);
        } else {
            var idx = parseInt(modal.getAttribute('data-listener-index'), 10);
            var existing = items[idx];
            if (!existing || existing.type !== LISTENER_TYPE) return;
            existing.name = cfg.name;
            existing.comments = cfg.comments || '';
            existing.enabled = cfg.enabled !== false;
            existing.classname = cfg.classname;
            existing.queue_size = cfg.queue_size;
            existing.parameters = cfg.parameters;
        }
        StepCatalog.syncLegacyStepListeners(step);
        hideModal(modal);
        markDirtyAndRefresh(planId);
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsHttpStepBlUiBound === '1') return;
        global.document.body.dataset.jmsHttpStepBlUiBound = '1';
        ensureModal();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsHttpStepBlUi = {
        UI_VERSION: UI_VERSION,
        LISTENER_TYPE: LISTENER_TYPE,
        ensureModal: ensureModal,
        openEditor: openEditor,
        close: cancelModal
    };
}(typeof window !== 'undefined' ? window : this));
