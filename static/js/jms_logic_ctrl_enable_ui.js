/**
 * 逻辑控制器及其挂载元件 · 树形卡片启用/停用（隔离模块）
 * 交互对齐配置元件：卡片分段切换，弹窗仅编辑参数。
 */
(function (global) {
    'use strict';

    var LOGIC_TYPES = [
        'if_controller', 'random_controller', 'simple_controller',
        'transaction_controller', 'loop_controller'
    ];
    var IF_MOUNT_TOGGLE_KINDS = ['timer', 'user_parameters', 'config', 'processor', 'pre_processor'];
    var COUNTER_TYPE = 'counter';
    var SEG_CLASS = 'jms-logic-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isLogicType(typeKey) {
        return LOGIC_TYPES.indexOf(typeKey) >= 0;
    }

    function isEnabledFlag(val) {
        return val !== false;
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
            ' data-logic-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-logic-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-logic-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderLogicStepToggle(planId, tgId, stepId, stepType, enabled) {
        if (!isLogicType(stepType)) return '';
        return renderCardToggle('logic-step', {
            'plan-id': planId,
            'tg-id': tgId,
            'step-id': stepId,
            'logic-type': stepType
        }, enabled);
    }

    function renderIfMountToggle(planId, tgId, ifStepId, mountKind, mountIndex, configType, enabled) {
        if (IF_MOUNT_TOGGLE_KINDS.indexOf(mountKind) < 0) return '';
        if (mountKind === 'config') {
            var MgrUi = global.JmsMgrConfigEnableUi;
            if (configType === COUNTER_TYPE) {
                /* 计数器走 If 挂载 config 分支，启用态由 entry.enabled 控制 */
            } else if (!MgrUi || typeof MgrUi.supportsType !== 'function' || !MgrUi.supportsType(configType)) {
                return '';
            }
        }
        return renderCardToggle('if-mount', {
            'plan-id': planId,
            'tg-id': tgId,
            'if-step-id': ifStepId,
            'if-mount-kind': mountKind,
            'if-mount-index': String(mountIndex == null ? 0 : mountIndex),
            'config-type': configType || ''
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-logic-enable-val');
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

    function isLogicContainer(st) {
        return st && isLogicType(st.type);
    }

    function findStepInList(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (s.id === stepId) { found = s; return true; }
            if (isLogicContainer(s) && s.children) {
                found = findStepInList(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function findStep(planId, tgId, stepId) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !stepId) return null;
        return findStepInList(tg.steps, stepId);
    }

    function getIfStep(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.getIf === 'function') return H.getIf(planId, tgId, ifStepId);
        var step = findStep(planId, tgId, ifStepId);
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isLogicMountHost === 'function') {
            return global.JmsIfMountModel.isLogicMountHost(step) ? step : null;
        }
        return step && step.type === 'if_controller' ? step : null;
    }

    function setLogicStepEnabled(planId, tgId, stepId, enabled) {
        var step = findStep(planId, tgId, stepId);
        if (!step || !isLogicType(step.type)) return false;
        step.enabled = enabled !== false;
        return true;
    }

    function setIfMountEnabled(planId, tgId, ifStepId, mountKind, mountIndex, configType, enabled) {
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep) return false;
        var on = enabled !== false;
        if (mountKind === 'timer') {
            if (!ifStep.constant_timer) {
                var Cat = global.JmsIfMountTimerCatalog;
                ifStep.constant_timer = Cat && typeof Cat.defaultTimerData === 'function'
                    ? Cat.defaultTimerData() : { enabled: false, name: '固定定时器', delay_ms: 300 };
            }
            ifStep.constant_timer.enabled = on;
            return true;
        }
        if (mountKind === 'user_parameters') {
            if (!ifStep.user_parameters) {
                var UpCat = global.JmsHttpStepUserParamsCatalog;
                ifStep.user_parameters = UpCat && typeof UpCat.defaultUserParams === 'function'
                    ? UpCat.defaultUserParams() : { enabled: false, params: [] };
            }
            ifStep.user_parameters.enabled = on;
            return true;
        }
        if (mountKind === 'config') {
            var list = ifStep.http_managers || [];
            var entry = list[mountIndex];
            if (!entry || (configType && entry.type !== configType)) return false;
            entry.enabled = on;
            return true;
        }
        if (mountKind === 'processor') {
            var procList = ifStep.processors || [];
            var proc = procList[mountIndex];
            if (!proc) return false;
            proc.enabled = on;
            return true;
        }
        if (mountKind === 'pre_processor') {
            var preList = ifStep.pre_processors || [];
            var pre = preList[mountIndex];
            if (!pre) return false;
            pre.enabled = on;
            return true;
        }
        return false;
    }

    function markLogicStepDirty(planId, tgId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function markIfMountDirty(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.markDirty === 'function') {
            H.markDirty(planId, tgId, ifStepId);
            return;
        }
        markLogicStepDirty(planId, tgId);
    }

    function refreshIfMountCard(seg) {
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ifStepId = seg.getAttribute('data-if-step-id') || '';
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep) return;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
        if (stepsEl && global.JmsTgIfMountTreeRows &&
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
        var enabled = btn.getAttribute('data-logic-enable-val') === '1';
        var scope = seg.getAttribute('data-logic-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'logic-step') {
            ok = setLogicStepEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', enabled);
            if (ok) markLogicStepDirty(planId, tgId);
        } else if (scope === 'if-mount') {
            ok = setIfMountEnabled(
                planId, tgId,
                seg.getAttribute('data-if-step-id') || '',
                seg.getAttribute('data-if-mount-kind') || '',
                parseInt(seg.getAttribute('data-if-mount-index'), 10) || 0,
                seg.getAttribute('data-config-type') || '',
                enabled
            );
            if (ok) {
                markIfMountDirty(planId, tgId, seg.getAttribute('data-if-step-id') || '');
                applyToggleUi(seg, enabled);
                patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
                patchCardDisabled(seg.closest('.jms-if-card'), enabled);
                patchCardDisabled(seg.closest('.jms-loop-card'), enabled);
                patchCardDisabled(seg.closest('.jms-random-card'), enabled);
                patchCardDisabled(seg.closest('.jms-simple-card'), enabled);
                patchCardDisabled(seg.closest('.jms-transaction-card'), enabled);
                refreshIfMountCard(seg);
            }
            return ok;
        }
        if (ok) {
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-if-card'), enabled);
            patchCardDisabled(seg.closest('.jms-loop-card'), enabled);
            patchCardDisabled(seg.closest('.jms-random-card'), enabled);
            patchCardDisabled(seg.closest('.jms-simple-card'), enabled);
            patchCardDisabled(seg.closest('.jms-transaction-card'), enabled);
        }
        return ok;
    }

    /** 弹窗保存时保留卡片上的启用态，避免覆盖 */
    function applyModalFieldsPreservingEnabled(step, data) {
        if (!step || !data) return;
        var enabled = step.enabled;
        Object.keys(data).forEach(function (k) {
            if (k === 'enabled') return;
            step[k] = data[k];
        });
        if (enabled !== undefined) step.enabled = enabled;
    }

    function bind() {
        if (global.document.body.dataset.jmsLogicCtrlEnableBound === '1') return;
        global.document.body.dataset.jmsLogicCtrlEnableBound = '1';
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

    global.JmsLogicCtrlEnableUi = {
        LOGIC_TYPES: LOGIC_TYPES,
        SEG_CLASS: SEG_CLASS,
        isLogicType: isLogicType,
        isEnabledFlag: isEnabledFlag,
        renderLogicStepToggle: renderLogicStepToggle,
        renderIfMountToggle: renderIfMountToggle,
        composeCardToolbar: composeCardToolbar,
        applyModalFieldsPreservingEnabled: applyModalFieldsPreservingEnabled,
        handleToggleClick: handleToggleClick
    };
}(typeof window !== 'undefined' ? window : this));
