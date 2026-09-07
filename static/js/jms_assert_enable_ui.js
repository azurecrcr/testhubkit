/**
 * 断言元件 · 树形卡片启用/停用（隔离模块）
 * 覆盖：线程组 tg.assertions、If 控制器 ifStep.assertions
 * HTTP 步骤挂载断言仍走 JmsHttpMountEnableUi
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-assert-enable-seg';

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

    function getIfStep(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.getIf === 'function') return H.getIf(planId, tgId, ifStepId);
        return null;
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="断言启用状态"' +
            ' data-assert-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-assert-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-assert-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderTgAssertToggle(planId, tgId, assertIndex, enabled) {
        return renderCardToggle('tg-assert', {
            'plan-id': planId,
            'tg-id': tgId,
            'assert-index': String(assertIndex == null ? 0 : assertIndex)
        }, enabled);
    }

    function renderIfMountAssertToggle(planId, tgId, ifStepId, assertIndex, enabled) {
        return renderCardToggle('if-mount-assert', {
            'plan-id': planId,
            'tg-id': tgId,
            'if-step-id': ifStepId,
            'assert-index': String(assertIndex == null ? 0 : assertIndex)
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-assert-enable-val');
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

    function setTgAssertEnabled(planId, tgId, assertIndex, enabled) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !Array.isArray(tg.assertions)) return false;
        var a = tg.assertions[assertIndex];
        if (!a) return false;
        a.enabled = enabled !== false;
        return true;
    }

    function setIfMountAssertEnabled(planId, tgId, ifStepId, assertIndex, enabled) {
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep || !Array.isArray(ifStep.assertions)) return false;
        var a = ifStep.assertions[assertIndex];
        if (!a) return false;
        a.enabled = enabled !== false;
        return true;
    }

    function markDirtyAndSync(planId, tgId, ifStepId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({
                planId: planId,
                tgId: tgId,
                ifStepId: ifStepId || ''
            });
            return;
        }
        if (ifStepId) {
            var H = global.JmsIfMountSaveHelper;
            if (H && typeof H.markDirty === 'function') {
                H.markDirty(planId, tgId, ifStepId);
                return;
            }
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function refreshIfMountCard(planId, tgId, ifStepId) {
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (stepsEl && ifStep && global.JmsTgIfMountTreeRows &&
            typeof global.JmsTgIfMountTreeRows.patchIfBodyInDom === 'function') {
            global.JmsTgIfMountTreeRows.patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
        }
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-assert-enable-val') === '1';
        var scope = seg.getAttribute('data-assert-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        var ifStepId = '';
        if (scope === 'tg-assert') {
            ok = setTgAssertEnabled(planId, tgId, parseInt(seg.getAttribute('data-assert-index'), 10) || 0, enabled);
        } else if (scope === 'if-mount-assert') {
            ifStepId = seg.getAttribute('data-if-step-id') || '';
            ok = setIfMountAssertEnabled(planId, tgId, ifStepId, parseInt(seg.getAttribute('data-assert-index'), 10) || 0, enabled);
        }
        if (ok) {
            markDirtyAndSync(planId, tgId, ifStepId);
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            if (scope === 'if-mount-assert') refreshIfMountCard(planId, tgId, ifStepId);
        }
        return ok;
    }

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
        if (global.document.body.dataset.jmsAssertEnableBound === '1') return;
        global.document.body.dataset.jmsAssertEnableBound = '1';
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

    global.JmsAssertEnableUi = {
        SEG_CLASS: SEG_CLASS,
        renderTgAssertToggle: renderTgAssertToggle,
        renderIfMountAssertToggle: renderIfMountAssertToggle,
        composeCardToolbar: composeCardToolbar,
        resolveEnabledForSave: resolveEnabledForSave,
        applyModalFieldsPreservingEnabled: applyModalFieldsPreservingEnabled
    };
}(typeof window !== 'undefined' ? window : this));
