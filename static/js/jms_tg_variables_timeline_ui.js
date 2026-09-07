/**
 * 线程组 · 用户定义变量时间线行（启用/停用、菜单、拖动柄配合）
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-mgr-enable-seg';
    var ENABLE_SCOPE = 'tg-variables-block';
    var ENABLE_VAL_ATTR = 'data-mgr-enable-val';
    var MODAL_ID = 'jms-tg-variables-editor-modal';
    var MODAL_UI_VERSION = '20260703tgvarsedit1';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function ensureVariablesBlock(tg) {
        if (!tg._variables_block) tg._variables_block = { enabled: true };
        return tg._variables_block;
    }

    function isVariablesBlockActive(tg) {
        var block = tg && tg._variables_block;
        if (!block) return true;
        return block.enabled !== false;
    }

    function refreshTgTree(planId, tgId) {
        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.refreshTgDetailByTgId === 'function') {
            global.JmsTgTreeShell.refreshTgDetailByTgId(planId, tgId);
        }
    }

    function markDirtyAndSync(planId, tgId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({});
        } else {
            var vb = global.JmsVisualBuilder;
            if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
            var ya = global.document.getElementById('yaml-input');
            if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (planId && tgId) refreshTgTree(planId, tgId);
    }

    function renderDragHandle(planId, tgId) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-tg-aux-kind="tg-variables" data-parent-step-id="">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function renderToggle(planId, tgId, enabled) {
        var on = enabled !== false;
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="用户定义变量启用状态"' +
            ' data-mgr-enable-scope="' + ENABLE_SCOPE + '"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" ' + ENABLE_VAL_ATTR + '="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" ' + ENABLE_VAL_ATTR + '="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderRowActions(planId, tgId) {
        var editBtn = '<button type="button" class="jms-btn-ghost jms-tg-variables-edit" role="menuitem"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">编辑</button>';
        var delBtn = '<button type="button" class="jms-btn-ghost jms-tg-variables-del" role="menuitem"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">删除</button>';
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="用户定义变量操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' + editBtn + delBtn + '</div></div>';
    }

    function composeRowToolbar(planId, tgId, enabled, actionsHtml) {
        var toggle = renderToggle(planId, tgId, enabled);
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(toggle, actionsHtml);
        }
        return '<div class="jms-config-card-toolbar">' + toggle + (actionsHtml || '') + '</div>';
    }



    function variablesSummary(tg) {
        var rows = Array.isArray(tg && tg.variables) ? tg.variables : [];
        var parts = [];
        rows.forEach(function (row) {
            var k = row && String(row.key || '').trim();
            if (!k) return;
            parts.push(k + '=' + (row.value == null ? '' : String(row.value)));
        });
        return parts.join(', ');
    }

    function renderTreeRow(planId, tg, options) {
        options = options || {};
        if (!tg) return '';
        var tgId = tg.id;
        var summary = typeof options.summary === 'string' ? options.summary : variablesSummary(tg);
        var enabled = typeof options.enabled === 'boolean' ? options.enabled : isVariablesBlockActive(tg);
        var disabled = enabled ? '' : ' is-disabled';
        var drag = typeof options.renderDragHandle === 'function'
            ? options.renderDragHandle(planId, tgId)
            : renderDragHandle(planId, tgId);
        var actions = composeRowToolbar(planId, tgId, enabled, renderRowActions(planId, tgId));
        return '<div class="jms-tree-node jms-tree-node--tg-variables" data-depth="0" style="--jms-tree-depth:0;" data-tg-aux-kind="tg-variables">' +
            drag +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--tg-config jms-aux-card--tg-config-mgr' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">V</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">用户定义的变量</span>' +
            '<span class="jms-aux-name" title="' + esc(summary) + '">' + esc(summary) + '</span>' +
            '</div>' + actions + '</div></div></div>';
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute(ENABLE_VAL_ATTR);
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function setEnabled(planId, tgId, enabled) {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return false;
        var tg = findTg(vb.getModel(), planId, tgId);
        if (!tg) return false;
        ensureVariablesBlock(tg).enabled = enabled !== false;
        return true;
    }

    function performDeleteVariables(planId, tgId, tg) {
        tg.variables = [];
        if (tg._variables_block) delete tg._variables_block;
        markDirtyAndSync(planId, tgId);
        return true;
    }

    function deleteVariables(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return false;
        var tg = findTg(vb.getModel(), planId, tgId);
        if (!tg) return false;
        var ConfirmUi = global.JmsTgVariablesDeleteConfirmUi;
        if (ConfirmUi && typeof ConfirmUi.confirmComponent === 'function') {
            ConfirmUi.confirmComponent({ tgName: tg.name || '' }).then(function (ok) {
                if (ok) performDeleteVariables(planId, tgId, tg);
            });
            return true;
        }
        var Del = global.JmsComponentDelete;
        if (Del && typeof Del.confirm === 'function') {
            Del.confirm({ title: '删除用户定义的变量', name: tg.name || '用户定义的变量' }).then(function (ok) {
                if (ok) performDeleteVariables(planId, tgId, tg);
            });
            return true;
        }
        if (!global.confirm('确定删除线程组「用户定义的变量」吗？')) return false;
        return performDeleteVariables(planId, tgId, tg);
    }


    function setEditorModalOpen(modal, open) {
        if (!modal) return;
        if (open) {
            modal.classList.add('jms-modal-open');
            modal.setAttribute('aria-hidden', 'false');
            modal.removeAttribute('hidden');
        } else {
            modal.classList.remove('jms-modal-open');
            modal.setAttribute('aria-hidden', 'true');
            modal.hidden = true;
        }
    }

    function closeStepMenus() {
        global.document.querySelectorAll('.lth-step-actions.is-open, .lth-step-actions.is-hover').forEach(function (el) {
            el.classList.remove('is-open', 'is-hover', 'is-measuring');
        });
    }

    function ensureModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === MODAL_UI_VERSION) return modal;
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-tg-variables-editor-modal';
        modal.setAttribute('data-ui-version', MODAL_UI_VERSION);
        modal.setAttribute('aria-hidden', 'true');
        modal.hidden = true;
        modal.innerHTML =
            '<div class="jms-modal__backdrop" data-close="1"></div>' +
            '<div class="jms-modal__panel" role="dialog" aria-modal="true" aria-labelledby="jms-tg-variables-editor-title">' +
            '<div class="jms-modal__head"><h3 id="jms-tg-variables-editor-title">用户定义的变量</h3>' +
            '<button type="button" class="jms-modal__close" data-close="1" aria-label="关闭">×</button></div>' +
            '<div class="jms-modal__body"><div class="jms-kv-list" data-tg-vars-rows></div>' +
            '<button type="button" class="jms-btn-ghost jms-tg-variables-add-row" type="button">+ 添加变量</button></div>' +
            '<div class="jms-modal__foot">' +
            '<button type="button" class="jms-btn-ghost" data-close="1">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-variables-save">保存</button></div></div>';
        global.document.body.appendChild(modal);
        return modal;
    }

    function fillRows(container, rows) {
        container.innerHTML = '';
        (rows || []).forEach(function (row) {
            appendRow(container, row.key || '', row.value == null ? '' : String(row.value));
        });
        if (!rows || !rows.length) appendRow(container, '', '');
    }

    function appendRow(container, key, val) {
        var row = global.document.createElement('div');
        row.className = 'jms-kv-row jms-var-row';
        row.innerHTML = '<input type="text" class="jms-kv-key hf-mono" placeholder="变量名">' +
            '<input type="text" class="jms-kv-val hf-mono" placeholder="值">' +
            '<button type="button" class="jms-kv-del" aria-label="删除">×</button>';
        row.querySelector('.jms-kv-key').value = key || '';
        row.querySelector('.jms-kv-val').value = val || '';
        container.appendChild(row);
    }

    function readRows(container) {
        var out = [];
        container.querySelectorAll('.jms-kv-row').forEach(function (row) {
            var key = (row.querySelector('.jms-kv-key') || {}).value || '';
            var val = (row.querySelector('.jms-kv-val') || {}).value || '';
            if (!String(key).trim()) return;
            out.push({ key: String(key).trim(), value: val });
        });
        return out;
    }

    var editorCtx = { planId: '', tgId: '' };

    function openEditor(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return;
        var tg = findTg(vb.getModel(), planId, tgId);
        if (!tg) return;
        editorCtx.planId = planId;
        editorCtx.tgId = tgId;
        var modal = ensureModal();
        var list = modal.querySelector('[data-tg-vars-rows]');
        fillRows(list, tg.variables || []);
        closeStepMenus();
        setEditorModalOpen(modal, true);
    }

    function closeEditor() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal) setEditorModalOpen(modal, false);
    }

    function saveEditor() {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return;
        var tg = findTg(vb.getModel(), editorCtx.planId, editorCtx.tgId);
        if (!tg) return;
        var modal = global.document.getElementById(MODAL_ID);
        var list = modal && modal.querySelector('[data-tg-vars-rows]');
        if (!list) return;
        tg.variables = readRows(list);
        ensureVariablesBlock(tg);
        markDirtyAndSync(editorCtx.planId, editorCtx.tgId);
        closeEditor();
    }

    function patchExportGuard() {
        var host = global.JmsTgJmxExportFilter;
        if (!host || host.__tgVariablesBlockGuard) return;
        var orig = host.filterVariablesForExport;
        if (typeof orig !== 'function') return;
        host.__tgVariablesBlockGuard = true;
        host.filterVariablesForExport = function (variables, tg) {
            if (tg && tg._variables_block && tg._variables_block.enabled === false) return {};
            return orig(variables, tg);
        };
    }

    function onDocumentClick(ev) {
        if (!global.document.body.classList.contains('lth-tg-view-tree') ||
            !global.document.body.classList.contains('lth-hub-jmeter-tab')) return;

        var toggleBtn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (toggleBtn) {
            var seg = toggleBtn.closest('.' + SEG_CLASS);
            if (!seg || seg.getAttribute('data-mgr-enable-scope') !== ENABLE_SCOPE) return;
            ev.preventDefault();
            ev.stopPropagation();
            var enabled = toggleBtn.getAttribute(ENABLE_VAL_ATTR) === '1';
            var planId = seg.getAttribute('data-plan-id') || '';
            var tgId = seg.getAttribute('data-tg-id') || '';
            if (setEnabled(planId, tgId, enabled)) {
                markDirtyAndSync(planId, tgId);
                applyToggleUi(seg, enabled);
                var card = seg.closest('.jms-aux-card');
                if (card) card.classList.toggle('is-disabled', !enabled);
            }
            return;
        }

        var editBtn = ev.target.closest('.jms-tg-variables-edit');
        if (editBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            openEditor(editBtn.getAttribute('data-plan-id'), editBtn.getAttribute('data-tg-id'));
            return;
        }

        var delBtn = ev.target.closest('.jms-tg-variables-del');
        if (delBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            deleteVariables(delBtn.getAttribute('data-plan-id'), delBtn.getAttribute('data-tg-id'));
        }
    }

    function onModalClick(ev) {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal || !modal.classList.contains('jms-modal-open')) return;
        if (ev.target.closest('[data-close="1"]')) {
            ev.preventDefault();
            closeEditor();
            return;
        }
        if (ev.target.closest('.jms-tg-variables-add-row')) {
            ev.preventDefault();
            appendRow(modal.querySelector('[data-tg-vars-rows]'), '', '');
            return;
        }
        if (ev.target.closest('.jms-kv-del')) {
            ev.preventDefault();
            var row = ev.target.closest('.jms-kv-row');
            if (row) row.remove();
            return;
        }
        if (ev.target.closest('.jms-tg-variables-save')) {
            ev.preventDefault();
            saveEditor();
        }
    }

    function bind() {
        if (global.document.body.dataset.jmsTgVariablesTimelineUiBound === '1') return;
        global.document.body.dataset.jmsTgVariablesTimelineUiBound = '1';
        global.document.addEventListener('click', onDocumentClick, true);
        global.document.addEventListener('click', onModalClick, true);
        patchExportGuard();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgVariablesTimelineUi = {
        renderDragHandle: renderDragHandle,
        renderRowActions: renderRowActions,
        composeRowToolbar: composeRowToolbar,
        renderTreeRow: renderTreeRow,
        variablesSummary: variablesSummary,
        isVariablesBlockActive: isVariablesBlockActive,
        ensureVariablesBlock: ensureVariablesBlock,
        openEditor: openEditor,
        deleteVariables: deleteVariables
    };
}(typeof window !== 'undefined' ? window : this));
