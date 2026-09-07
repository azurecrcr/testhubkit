/**
 * 树形视图 · Catalog 等通用步骤启用/停用（隔离模块，对齐 JMeter enabled）
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-step-enable-seg';

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

    function sidEq(a, b) {
        return String(a) === String(b);
    }

    function findTgRobust(planId, tgId) {
        if (global.JmsStudioV2TreeStepEditFix &&
            typeof global.JmsStudioV2TreeStepEditFix.findTgRobust === 'function') {
            return global.JmsStudioV2TreeStepEditFix.findTgRobust(planId, tgId);
        }
        var m = getModel();
        if (!m || !tgId) return null;
        var hits = [];
        function scan(list, pid) {
            (list || []).forEach(function (t) {
                if (t && sidEq(t.id, tgId)) hits.push({ tg: t, planId: pid });
            });
        }
        scan(m.setup_thread_groups, planId || '');
        (m.test_plans || []).forEach(function (p) { scan(p.thread_groups, p.id); });
        scan(m.post_thread_groups, planId || '');
        if (!hits.length) return null;
        if (planId) {
            var exact = hits.find(function (h) { return sidEq(h.planId, planId); });
            if (exact) return exact.tg;
        }
        return hits[0].tg;
    }

    function findStepInTree(list, stepId) {
        if (global.JmsStudioV2TreeStepEditFix &&
            typeof global.JmsStudioV2TreeStepEditFix.findStepInTree === 'function') {
            return global.JmsStudioV2TreeStepEditFix.findStepInTree(list, stepId);
        }
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (sidEq(s.id, stepId)) { found = s; return true; }
            if (s.children) {
                found = findStepInTree(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function renderStepToggle(planId, tgId, stepId, enabled) {
        var on = enabled !== false;
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="启用状态"' +
            ' data-step-enable-scope="catalog-step"' +
            ' data-plan-id="' + esc(planId) + '"' +
            ' data-tg-id="' + esc(tgId) + '"' +
            ' data-step-id="' + esc(stepId) + '">' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-step-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-step-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-step-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function markDirty(planId, tgId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        if (vb && typeof vb.scheduleRender === 'function') vb.scheduleRender();
        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.syncAll === 'function') {
            global.JmsTgTreeShell.syncAll(true);
        }
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setStepEnabled(planId, tgId, stepId, enabled) {
        var tg = findTgRobust(planId, tgId);
        if (!tg || !stepId) return false;
        var step = findStepInTree(tg.steps, stepId);
        if (!step) return false;
        step.enabled = enabled !== false;
        return true;
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg || seg.getAttribute('data-step-enable-scope') !== 'catalog-step') return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-step-enable-val') === '1';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var stepId = seg.getAttribute('data-step-id') || '';
        if (!setStepEnabled(planId, tgId, stepId, enabled)) return false;
        applyToggleUi(seg, enabled);
        patchCardDisabled(seg.closest('.jms-catalog-card'), enabled);
        markDirty(planId, tgId);
        return true;
    }

    function bind() {
        if (global.document.body.dataset.jmsTgTreeStepEnableUnifyBound === '1') return;
        global.document.body.dataset.jmsTgTreeStepEnableUnifyBound = '1';
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

    global.JmsTgTreeStepEnableUnify = {
        SEG_CLASS: SEG_CLASS,
        renderStepToggle: renderStepToggle,
        composeCardToolbar: composeCardToolbar
    };
}(typeof window !== 'undefined' ? window : this));
