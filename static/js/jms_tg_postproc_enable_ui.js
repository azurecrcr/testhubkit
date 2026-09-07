/**
 * 线程组后置处理器 · 树形卡片启用/停用（隔离模块）
 * 覆盖：TG 步骤树 aux 后置步骤、线程组 tg.processors 区块
 */
(function (global) {
    'use strict';

    var POSTPROC_AUX_TYPES = [
        'beanshell_post', 'json_post', 'regex_extract',
        'xpath_extract', 'jdbc_post', 'jsr223_post'
    ];
    var SEG_CLASS = 'jms-postproc-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isPostprocAuxType(typeKey) {
        return POSTPROC_AUX_TYPES.indexOf(typeKey) >= 0;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
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

    function findAuxStep(planId, tgId, stepId) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !stepId) return null;
        return findStepInList(tg.steps, stepId);
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="启用状态"' +
            ' data-postproc-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-postproc-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-postproc-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderAuxStepToggle(planId, tgId, stepId, enabled) {
        return renderCardToggle('tg-aux-step', {
            'plan-id': planId,
            'tg-id': tgId,
            'step-id': stepId
        }, enabled);
    }

    function renderTgProcessorToggle(planId, tgId, procIndex, enabled) {
        return renderCardToggle('tg-processor', {
            'plan-id': planId,
            'tg-id': tgId,
            'proc-index': String(procIndex == null ? 0 : procIndex)
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-postproc-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function setAuxStepEnabled(planId, tgId, stepId, enabled) {
        var step = findAuxStep(planId, tgId, stepId);
        if (!step || !isPostprocAuxType(step.type)) return false;
        step.enabled = enabled !== false;
        return true;
    }

    function setTgProcessorEnabled(planId, tgId, procIndex, enabled) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !Array.isArray(tg.processors)) return false;
        var proc = tg.processors[procIndex];
        if (!proc) return false;
        proc.enabled = enabled !== false;
        return true;
    }

    function markDirtyAndSync() {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({});
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-postproc-enable-val') === '1';
        var scope = seg.getAttribute('data-postproc-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'tg-aux-step') {
            ok = setAuxStepEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', enabled);
        } else if (scope === 'tg-processor') {
            ok = setTgProcessorEnabled(
                planId, tgId,
                parseInt(seg.getAttribute('data-proc-index'), 10) || 0,
                enabled
            );
        }
        if (ok) {
            markDirtyAndSync();
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            patchCardDisabled(seg.closest('.jms-tree-processor-row'), enabled);
        }
        return ok;
    }

    /** 弹窗保存时保留卡片上的启用态，避免覆盖 */
    function resolveEnabledForSave(existingItem, fieldsFromForm) {
        if (existingItem && existingItem.enabled !== undefined) {
            return existingItem.enabled !== false;
        }
        if (fieldsFromForm && fieldsFromForm.enabled !== undefined) {
            return fieldsFromForm.enabled !== false;
        }
        return true;
    }

    function applyModalFieldsPreservingEnabled(target, data) {
        if (!target || !data) return;
        var enabled = target.enabled;
        Object.keys(data).forEach(function (k) {
            if (k === 'enabled') return;
            target[k] = data[k];
        });
        if (enabled !== undefined) target.enabled = enabled;
    }

    function bind() {
        if (global.document.body.dataset.jmsTgPostprocEnableBound === '1') return;
        global.document.body.dataset.jmsTgPostprocEnableBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgPostprocEnableUi = {
        SEG_CLASS: SEG_CLASS,
        POSTPROC_AUX_TYPES: POSTPROC_AUX_TYPES,
        isPostprocAuxType: isPostprocAuxType,
        renderAuxStepToggle: renderAuxStepToggle,
        renderTgProcessorToggle: renderTgProcessorToggle,
        composeCardToolbar: composeCardToolbar,
        resolveEnabledForSave: resolveEnabledForSave,
        applyModalFieldsPreservingEnabled: applyModalFieldsPreservingEnabled
    };
}(typeof window !== 'undefined' ? window : this));
