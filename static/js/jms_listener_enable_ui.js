/**
 * 监听器 · 树形卡片启用/停用（隔离模块）
 * 覆盖：线程组 tg.listeners、If 控制器 ifStep.step_listeners
 * HTTP 步骤挂载监听器仍走 JmsHttpMountEnableUi
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-listener-enable-seg';

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

    var LISTENER_KEYS = ['view_results_tree', 'aggregate_report', 'backend_listener'];
    var TL = function () { return global.JmsTgListenerTimeline; };

    function getIfStep(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.getIf === 'function') return H.getIf(planId, tgId, ifStepId);
        return null;
    }

    function getTgListenerConfig(tg, key) {
        var cfg = tg && tg[key];
        return cfg && typeof cfg === 'object' ? cfg : null;
    }

    function getIfListenerConfig(ifStep, key) {
        var cfg = ifStep && ifStep[key];
        return cfg && typeof cfg === 'object' ? cfg : null;
    }

    function isTgListenerPresent(tg, key) {
        var timeline = TL();
        return timeline && typeof timeline.isEnabled === 'function'
            ? timeline.isEnabled(tg, key) : !!(tg && tg.listeners && tg.listeners[key]);
    }

    function isIfMountListenerPresent(ifStep, key) {
        var sl = ifStep && ifStep.step_listeners;
        return !!(sl && sl[key]);
    }

    function isTgListenerActive(tg, key) {
        if (!isTgListenerPresent(tg, key)) return false;
        var cfg = getTgListenerConfig(tg, key);
        return !(cfg && cfg.enabled === false);
    }

    function isIfMountListenerActive(ifStep, key) {
        if (!isIfMountListenerPresent(ifStep, key)) return false;
        var cfg = getIfListenerConfig(ifStep, key);
        return !(cfg && cfg.enabled === false);
    }

    function renderTgListenerToggle(planId, tgId, listenerKey, enabled) {
        return renderCardToggle('tg-listener', {
            'plan-id': planId,
            'tg-id': tgId,
            'listener-key': listenerKey || ''
        }, enabled);
    }

    function renderIfMountListenerToggle(planId, tgId, ifStepId, listenerKey, enabled) {
        return renderCardToggle('if-mount-listener', {
            'plan-id': planId,
            'tg-id': tgId,
            'if-step-id': ifStepId,
            'listener-key': listenerKey || ''
        }, enabled);
    }

    function ensureTgListenerConfig(tg, key) {
        var timeline = TL();
        if (timeline && typeof timeline.ensureConfig === 'function') return timeline.ensureConfig(tg, key);
        if (!tg[key] || typeof tg[key] !== 'object') tg[key] = { name: key, enabled: true };
        return tg[key];
    }

    function setTgListenerEnabled(planId, tgId, listenerKey, enabled) {
        if (LISTENER_KEYS.indexOf(listenerKey) < 0) return false;
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !isTgListenerPresent(tg, listenerKey)) return false;
        if (!tg.listeners) tg.listeners = {};
        tg.listeners[listenerKey] = true;
        var cfg = ensureTgListenerConfig(tg, listenerKey);
        cfg.enabled = enabled !== false;
        return true;
    }

    function setIfMountListenerEnabled(planId, tgId, ifStepId, listenerKey, enabled) {
        if (LISTENER_KEYS.indexOf(listenerKey) < 0) return false;
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep || !isIfMountListenerPresent(ifStep, listenerKey)) return false;
        if (!ifStep.step_listeners) ifStep.step_listeners = {};
        ifStep.step_listeners[listenerKey] = true;
        var cfg = getIfListenerConfig(ifStep, listenerKey);
        if (!cfg) { cfg = { name: listenerKey, enabled: true }; ifStep[listenerKey] = cfg; }
        cfg.enabled = enabled !== false;
        return true;
    }

    function refreshTgListenerRows(planId, tgId) {
        if (global.JmsTgListenerTreeRows && typeof global.JmsTgListenerTreeRows.refreshTgTree === 'function') {
            global.JmsTgListenerTreeRows.refreshTgTree(planId, tgId);
        }
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="监听器启用状态"' +
            ' data-listener-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-listener-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-listener-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderTgAssertToggle(planId, tgId, assertIndex, enabled) {
        return renderCardToggle('tg-listener', {
            'plan-id': planId,
            'tg-id': tgId,
            'assert-index': String(assertIndex == null ? 0 : assertIndex)
        }, enabled);
    }

    function renderIfMountAssertToggle(planId, tgId, ifStepId, assertIndex, enabled) {
        return renderCardToggle('if-mount-listener', {
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
            var val = btn.getAttribute('data-listener-enable-val');
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
        var enabled = btn.getAttribute('data-listener-enable-val') === '1';
        var scope = seg.getAttribute('data-listener-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        var ifStepId = '';
        if (scope === 'tg-listener') {
            ok = setTgListenerEnabled(planId, tgId, seg.getAttribute('data-listener-key') || '', enabled);
        } else if (scope === 'if-mount-listener') {
            ifStepId = seg.getAttribute('data-if-step-id') || '';
            ok = setIfMountListenerEnabled(planId, tgId, ifStepId, seg.getAttribute('data-listener-key') || '', enabled);
        }
        if (ok) {
            markDirtyAndSync(planId, tgId, ifStepId);
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            if (scope === 'if-mount-listener') refreshIfMountCard(planId, tgId, ifStepId);
            else refreshTgListenerRows(planId, tgId);
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
        if (global.document.body.dataset.jmsListenerEnableBound === '1') return;
        global.document.body.dataset.jmsListenerEnableBound = '1';
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

    global.JmsListenerEnableUi = {
        SEG_CLASS: SEG_CLASS,
        LISTENER_KEYS: LISTENER_KEYS,
        isTgListenerActive: isTgListenerActive,
        isIfMountListenerActive: isIfMountListenerActive,
        renderTgListenerToggle: renderTgListenerToggle,
        renderIfMountListenerToggle: renderIfMountListenerToggle,
        composeCardToolbar: composeCardToolbar,
        resolveEnabledForSave: resolveEnabledForSave
    };
}(typeof window !== 'undefined' ? window : this));
