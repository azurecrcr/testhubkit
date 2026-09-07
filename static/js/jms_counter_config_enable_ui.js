/**
 * 计数器配置元件 · 树形卡片启用/停用切换（隔离模块，仅 counter）
 * 弹窗内仅保留参数编辑；启用态在组件卡片上操作。
 */
(function (global) {
    'use strict';

    var COUNTER_TYPE = 'counter';
    var SEG_CLASS = 'jms-counter-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isEnabled(data) {
        return !data || data.enabled !== false;
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="计数器启用状态" data-counter-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') + '" data-counter-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') + '" data-counter-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-counter-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findPlan(model, planId) {
        return (model.test_plans || []).find(function (p) { return p.id === planId; });
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = findPlan(model, planId);
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

    function findHttpStep(model, planId, tgId, stepId) {
        if (!model || !stepId) return null;
        var tg = findTg(model, planId, tgId);
        if (!tg || !Array.isArray(tg.steps)) return null;
        function walk(list) {
            var found = null;
            (list || []).some(function (s) {
                if (!s) return false;
                if (s.id === stepId) { found = s; return true; }
                if (s.type === 'if_controller' && s.children) {
                    found = walk(s.children);
                    return !!found;
                }
                return false;
            });
            return found;
        }
        return walk(tg.steps);
    }

    function setTgCounterEnabled(planId, tgId, itemId, enabled) {
        var Catalog = global.JmsTgConfigCatalog;
        var model = getModel();
        var tg = findTg(model, planId, tgId);
        if (!tg || !itemId || !Catalog) return false;
        var item = (Catalog.ensureConfigItems ? Catalog.ensureConfigItems(tg) : tg.config_items || [])
            .find(function (it) { return it && it.id === itemId && it.type === COUNTER_TYPE; });
        if (!item) return false;
        if (!item.data) item.data = {};
        item.data.enabled = enabled !== false;
        return true;
    }

    function setStepCounterEnabled(planId, tgId, stepId, enabled) {
        var Catalog = global.JmsHttpStepConfigCatalog;
        var step = findHttpStep(getModel(), planId, tgId, stepId);
        if (!step || !Catalog) return false;
        if (!step.http_managers) step.http_managers = Catalog.defaultStepHttpManagers();
        if (!step.http_managers.counter) step.http_managers.counter = Catalog.defaultCounterData();
        step.http_managers.counter.enabled = enabled !== false;
        var sel = Catalog.parseSelectedTypes(step.http_managers.selected_types);
        if (enabled !== false && sel.indexOf(COUNTER_TYPE) < 0) {
            sel.push(COUNTER_TYPE);
            step.http_managers.selected_types = sel;
        }
        return true;
    }

    function markTgDirty(planId, tgId) {
        if (global.JmsTgConfigUi && typeof global.JmsTgConfigUi.markDirtyAndSync === 'function') {
            global.JmsTgConfigUi.markDirtyAndSync(planId, tgId);
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
    }

    function markStepDirty(planId, tgId, stepId) {
        if (global.JmsHttpStepConfigUi && typeof global.JmsHttpStepConfigUi.markDirtyAndRefresh === 'function') {
            global.JmsHttpStepConfigUi.markDirtyAndRefresh(planId, tgId, stepId);
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
    }

    function patchInlineRowDisabled(segEl, enabled) {
        if (!segEl) return;
        var ctxRow = segEl.closest('.jms-http-context__config-row');
        if (ctxRow) ctxRow.classList.toggle('is-disabled', enabled === false);
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-counter-enable-val') === '1';
        var scope = seg.getAttribute('data-counter-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'tg') {
            ok = setTgCounterEnabled(planId, tgId, seg.getAttribute('data-config-id') || '', enabled);
            if (ok) {
                if (global.JmsTgEnableDirtySync &&
                    typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
                    global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
                } else {
                    markTgDirty(planId, tgId);
                }
            }
        } else if (scope === 'step') {
            ok = setStepCounterEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', enabled);
            if (ok) {
                if (global.JmsTgEnableDirtySync &&
                    typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
                    global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
                } else {
                    markStepDirty(planId, tgId, seg.getAttribute('data-step-id') || '');
                }
            }
        }
        if (ok) {
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            patchInlineRowDisabled(seg, enabled);
        }
        return ok;
    }

    function counterMountVisible(mgr) {
        if (!mgr || typeof mgr.counter !== 'object') return false;
        var Catalog = global.JmsHttpStepConfigCatalog;
        if (Catalog && typeof Catalog.parseSelectedTypes === 'function') {
            var sel = Catalog.parseSelectedTypes(mgr.selected_types);
            if (sel.length) return sel.indexOf(COUNTER_TYPE) >= 0;
        }
        return mgr.counter.enabled !== false;
    }

    function bind() {
        if (global.document.body.dataset.jmsCounterConfigEnableBound === '1') return;
        global.document.body.dataset.jmsCounterConfigEnableBound = '1';
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

    global.JmsCounterConfigEnableUi = {
        COUNTER_TYPE: COUNTER_TYPE,
        SEG_CLASS: SEG_CLASS,
        isEnabled: isEnabled,
        renderCardToggle: renderCardToggle,
        applyToggleUi: applyToggleUi,
        patchCardDisabled: patchCardDisabled,
        handleToggleClick: handleToggleClick,
        counterMountVisible: counterMountVisible,
        setTgCounterEnabled: setTgCounterEnabled,
        setStepCounterEnabled: setStepCounterEnabled,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
