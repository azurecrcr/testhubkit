/**
 * catalog_element · 删除入口（隔离模块，不修改 jmeter_visual_builder 主流程）
 */
(function (global) {
    'use strict';

    function vb() {
        return global.JmsVisualBuilder;
    }

    function appendApi() {
        return global.JmsCatalogContextAppend;
    }

    function escLabel(s) {
        return String(s == null ? '' : s).trim();
    }

    function stopClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
    }

    function closeStepMenus(exceptBtn) {
        global.document.querySelectorAll('.lth-step-actions.is-open').forEach(function (wrap) {
            if (exceptBtn && wrap.contains(exceptBtn)) return;
            wrap.classList.remove('is-open', 'is-hover', 'is-measuring');
            var menu = wrap.querySelector('.lth-step-menu');
            if (menu) menu.classList.remove('lth-step-menu--dropup');
        });
    }

    function removeStepFromList(list, stepId) {
        if (!list || !stepId) return false;
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === want) {
                list.splice(i, 1);
                return true;
            }
            if (Array.isArray(s.children) && removeStepFromList(s.children, stepId)) {
                return true;
            }
        }
        return false;
    }

    function findTg(model, planId, tgId) {
        if (appendApi() && typeof appendApi().findTg === 'function') {
            return appendApi().findTg(model, planId, tgId);
        }
        return null;
    }

    function resolveCard(btn) {
        return btn.closest(
            '.jms-catalog-card, .jms-plan-catalog-card, .jms-catalog-plan-native, .jms-aux-card.jms-catalog-plan-native'
        );
    }

    function resolveContext(btn) {
        var card = resolveCard(btn);
        var planId = btn.getAttribute('data-plan-id') || (card && card.getAttribute('data-plan-id')) || '';
        var tgId = btn.getAttribute('data-tg-id');
        if (tgId == null && card) tgId = card.getAttribute('data-tg-id');
        tgId = tgId || '';
        var stepId = btn.getAttribute('data-step-id') || (card && card.getAttribute('data-step-id')) || '';
        var isPlanLevel = (card && card.getAttribute('data-plan-level') === '1') || !tgId;
        return { card: card, planId: planId, tgId: tgId, stepId: stepId, isPlanLevel: isPlanLevel };
    }

    function resolveStep(model, ctx) {
        if (!model || !ctx || !ctx.stepId) return null;
        if (ctx.isPlanLevel) {
            var list = model.plan_catalog_items || [];
            var want = String(ctx.stepId);
            for (var i = 0; i < list.length; i += 1) {
                if (list[i] && String(list[i].id) === want) return list[i];
            }
            return null;
        }
        var tg = findTg(model, ctx.planId, ctx.tgId);
        if (!tg || !Array.isArray(tg.steps)) return null;
        var E = global.JmsCatalogElementEditorUi;
        if (E && typeof E.locateStep === 'function') {
            var loc = E.locateStep(model, ctx.planId, ctx.tgId, ctx.stepId, {});
            if (loc && loc.step) return loc.step;
        }
        return walkFindStep(tg.steps, ctx.stepId);
    }

    function walkFindStep(list, stepId) {
        if (!list || !stepId) return null;
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === want) return s;
            if (Array.isArray(s.children)) {
                var nested = walkFindStep(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function stepLabel(step, fallback) {
        if (!step) return fallback || '该元件';
        return escLabel(step.name || step.label_zh || step.alias) || fallback || '该元件';
    }

    function confirmDelete(title, name, action) {
        var visual = vb();
        if (visual && typeof visual.runWithConfirm === 'function') {
            visual.runWithConfirm({
                title: title || '删除元件',
                message: '确定删除「' + name + '」吗？删除后不可恢复。'
            }, action);
            return;
        }
        var Del = global.JmsComponentDelete;
        if (Del && typeof Del.confirm === 'function') {
            Del.confirm({
                title: title || '删除元件',
                name: name,
                message: '确定删除「' + name + '」吗？删除后不可恢复。'
            }).then(function (ok) {
                if (ok && typeof action === 'function') action();
            });
            return;
        }
        if (global.confirm('确定删除「' + name + '」吗？') && typeof action === 'function') {
            action();
        }
    }

    function markDirtyAndRender(visual) {
        if (!visual) return;
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (typeof visual.triggerRender === 'function') visual.triggerRender();
        if (typeof visual.syncYamlFromModel === 'function') visual.syncYamlFromModel();
    }

    function removePlanCatalogStep(model, step, stepId) {
        var list = model.plan_catalog_items || [];
        var before = list.length;
        model.plan_catalog_items = list.filter(function (it) {
            if (!it) return false;
            if (step && it === step) return false;
            if (stepId && String(it.id) === String(stepId)) return false;
            return true;
        });
        return model.plan_catalog_items.length < before;
    }

    function performDelete(ctx, step) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var model = visual.getModel();
        if (!model) return false;

        var stepId = (step && step.id) || ctx.stepId;
        if (!stepId && !step) return false;

        var ok = false;
        if (ctx.isPlanLevel) {
            ok = removePlanCatalogStep(model, step, stepId);
        } else {
            var tg = findTg(model, ctx.planId, ctx.tgId);
            if (tg && Array.isArray(tg.steps)) {
                ok = removeStepFromList(tg.steps, stepId);
            }
        }
        if (!ok) return false;
        markDirtyAndRender(visual);
        return true;
    }

    function onDeleteClick(ev) {
        var btn = ev.target.closest('.jms-btn-del-catalog, .jms-tree-del');
        if (!btn) return false;

        stopClick(ev);
        closeStepMenus(btn);

        var ctx = resolveContext(btn);
        if (!ctx.planId || !ctx.stepId) return true;

        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return true;
        var model = visual.getModel();
        if (!model) return true;

        var step = resolveStep(model, ctx);
        var label = stepLabel(step, '该元件');
        var title = ctx.isPlanLevel ? '删除计划元件' : '删除步骤元件';
        var frozenCtx = {
            card: ctx.card,
            planId: ctx.planId,
            tgId: ctx.tgId,
            stepId: (step && step.id) || ctx.stepId,
            isPlanLevel: ctx.isPlanLevel
        };

        confirmDelete(title, label, function () {
            performDelete(frozenCtx, step);
        });
        return true;
    }

    function bind() {
        /* 由 jms_catalog_element_editor_ui.bindTreeClicks 统一委托，避免重复绑定 */
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogElementDeleteUi = {
        bind: bind,
        onDeleteClick: onDeleteClick,
        performDelete: performDelete
    };
})(typeof window !== 'undefined' ? window : this);
