/**
 * HTTP 配置元件 · 树形卡片启用/停用切换（隔离模块，不含 counter）
 * 覆盖：HTTP 默认值 / 请求头 / 授权 / Cookie / 缓存 / CSV
 */
(function (global) {
    'use strict';

    var TOGGLE_TYPES = [
        'http_defaults', 'header_manager', 'auth_manager',
        'cookie_manager', 'cache_manager', 'csv_data_set'
    ];
    var SEG_CLASS = 'jms-mgr-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function supportsType(typeKey) {
        return TOGGLE_TYPES.indexOf(typeKey) >= 0;
    }

    function isEnabled(data) {
        return !data || data.enabled !== false;
    }

    function typeLabel(typeKey) {
        var Catalog = global.JmsHttpStepConfigCatalog || global.JmsTgConfigCatalog;
        if (Catalog && Catalog.LABELS && Catalog.LABELS[typeKey]) return Catalog.LABELS[typeKey];
        return typeKey;
    }

    function renderCardToggle(scope, typeKey, attrs, enabled) {
        if (!supportsType(typeKey)) return '';
        var on = enabled !== false;
        var attrStr = ' data-config-type="' + esc(typeKey) + '"';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="' + esc(typeLabel(typeKey)) + '启用状态"' +
            ' data-mgr-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-mgr-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-mgr-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-mgr-enable-val');
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

    function getStepSlice(mgr, typeKey) {
        if (!mgr) return null;
        if (typeKey === 'http_defaults') return mgr.http_defaults;
        return mgr[typeKey];
    }

    function setStepSliceEnabled(mgr, typeKey, enabled) {
        if (!mgr || !supportsType(typeKey)) return false;
        if (typeKey === 'http_defaults') {
            if (!mgr.http_defaults) mgr.http_defaults = {};
            mgr.http_defaults.enabled = enabled !== false;
        } else {
            if (!mgr[typeKey]) {
                var Catalog = global.JmsHttpStepConfigCatalog;
                if (Catalog && typeof Catalog.defaultStepHttpManagers === 'function') {
                    mgr[typeKey] = Object.assign({}, Catalog.defaultStepHttpManagers()[typeKey] || {});
                } else {
                    mgr[typeKey] = { enabled: enabled !== false };
                }
            }
            mgr[typeKey].enabled = enabled !== false;
        }
        return true;
    }

    function setTgItemEnabled(planId, tgId, itemId, typeKey, enabled) {
        var Catalog = global.JmsTgConfigCatalog;
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !itemId || !Catalog || !supportsType(typeKey)) return false;
        var item = (Catalog.ensureConfigItems ? Catalog.ensureConfigItems(tg) : tg.config_items || [])
            .find(function (it) { return it && it.id === itemId && it.type === typeKey; });
        if (!item) return false;
        if (!item.data) item.data = Catalog.defaultItemData(typeKey);
        item.data.enabled = enabled !== false;
        return true;
    }

    function setStepMgrEnabled(planId, tgId, stepId, typeKey, enabled) {
        var Catalog = global.JmsHttpStepConfigCatalog;
        var step = findHttpStep(getModel(), planId, tgId, stepId);
        if (!step || !Catalog || !supportsType(typeKey)) return false;
        if (!step.http_managers) step.http_managers = Catalog.defaultStepHttpManagers();
        setStepSliceEnabled(step.http_managers, typeKey, enabled);
        var sel = Catalog.parseSelectedTypes(step.http_managers.selected_types);
        if (enabled !== false && sel.indexOf(typeKey) < 0) {
            sel.push(typeKey);
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

    function mountVisible(mgr, typeKey) {
        var Catalog = global.JmsHttpStepConfigCatalog;
        if (!supportsType(typeKey)) return null;
        if (Catalog && typeof Catalog.typeActive === 'function') {
            return Catalog.typeActive(mgr, typeKey);
        }
        var slice = getStepSlice(mgr, typeKey);
        return !!(slice && slice.enabled !== false);
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        var typeKey = seg.getAttribute('data-config-type') || '';
        if (!supportsType(typeKey)) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-mgr-enable-val') === '1';
        var scope = seg.getAttribute('data-mgr-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'tg') {
            ok = setTgItemEnabled(planId, tgId, seg.getAttribute('data-config-id') || '', typeKey, enabled);
            if (ok) {
                if (global.JmsTgEnableDirtySync &&
                    typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
                    global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
                } else {
                    markTgDirty(planId, tgId);
                }
            }
        } else if (scope === 'step') {
            ok = setStepMgrEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', typeKey, enabled);
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
            var ctxRow = seg.closest('.jms-http-context__config-row');
            if (ctxRow) ctxRow.classList.toggle('is-disabled', enabled === false);
        }
        return true;
    }

    function getTgCardClass(typeKey) {
        if (!supportsType(typeKey)) return '';
        return ' jms-aux-card--tg-config-mgr jms-aux-card--tg-config-' + typeKey.replace(/_/g, '-');
    }

    function getMountCardClass(typeKey) {
        if (!supportsType(typeKey)) return '';
        return ' jms-aux-card--http-mount-config-mgr jms-aux-card--http-mount-config-' + typeKey.replace(/_/g, '-');
    }

    /** 将启用切换与 ⋮ 菜单分离，避免悬浮切换按钮时误展开编辑/删除菜单 */
    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    global.JmsMgrConfigEnableUi = {
        TOGGLE_TYPES: TOGGLE_TYPES,
        SEG_CLASS: SEG_CLASS,
        supportsType: supportsType,
        isEnabled: isEnabled,
        renderCardToggle: renderCardToggle,
        applyToggleUi: applyToggleUi,
        patchCardDisabled: patchCardDisabled,
        handleToggleClick: handleToggleClick,
        mountVisible: mountVisible,
        getTgCardClass: getTgCardClass,
        getMountCardClass: getMountCardClass,
        composeCardToolbar: composeCardToolbar,
        setTgItemEnabled: setTgItemEnabled,
        setStepMgrEnabled: setStepMgrEnabled
    };
}(typeof window !== 'undefined' ? window : this));
