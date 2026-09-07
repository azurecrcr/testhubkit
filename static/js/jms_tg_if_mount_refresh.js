/**
 * If 控制器挂载区 · DOM 局部刷新（隔离模块，不影响 HTTP / TG 级刷新）
 */
(function (global) {
    'use strict';

    var Model = function () { return global.JmsIfMountModel; };

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findPlanCard(planId) {
        if (!planId) return null;
        return global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
    }

    function patchIfMountRowsInDom(planId, tgId, ifStepId) {
        if (!planId || !tgId || !ifStepId) return false;
        var card = findPlanCard(planId);
        if (!card) return false;
        var stepsEl = card.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        if (!Model() || typeof Model().findLogicMountStep !== 'function') return false;
        var ifStep = (Model().findMountHostStep ? Model().findMountHostStep(planId, tgId, ifStepId) : Model().findLogicMountStep(planId, tgId, ifStepId));
        if (!ifStep) return false;
        if (Model().ensureMountFields) ifStep = Model().ensureMountFields(ifStep);
        if (!global.JmsTgIfMountTreeRows ||
            typeof global.JmsTgIfMountTreeRows.patchMountRowsInDom !== 'function') {
            return false;
        }
        return global.JmsTgIfMountTreeRows.patchMountRowsInDom(stepsEl, ifStep, planId, tgId);
    }

    function markDirtyAndRefresh(planId, tgId, ifStepId) {
        var bodyOk = false;
        if (global.JmsTgIfMountTreeRows && typeof global.JmsTgIfMountTreeRows.patchIfBodyInDom === 'function') {
            var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
            var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
            var ifStep = (Model().findMountHostStep ? Model().findMountHostStep(planId, tgId, ifStepId) : Model().findLogicMountStep(planId, tgId, ifStepId));
            if (stepsEl && ifStep) {
                bodyOk = global.JmsTgIfMountTreeRows.patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
            }
        }
        if (bodyOk) return true;
        if (global.JmsCatalogSamplerMountRefresh && typeof global.JmsCatalogSamplerMountRefresh.patchByStepId === 'function') {
            if (global.JmsCatalogSamplerMountRefresh.patchByStepId(planId, tgId, ifStepId)) return true;
        }
        var mountOk = patchIfMountRowsInDom(planId, tgId, ifStepId);
        var childrenOk = false;
        if (global.JmsTgIfMountChildrenPatch &&
            typeof global.JmsTgIfMountChildrenPatch.patchIfChildrenInDom === 'function') {
            childrenOk = global.JmsTgIfMountChildrenPatch.patchIfChildrenInDom(planId, tgId, ifStepId);
        }
        if (mountOk || childrenOk) return true;
        if (tgId && global.JmsTgTreeShell &&
            typeof global.JmsTgTreeShell.refreshTgDetailByTgId === 'function') {
            if (global.JmsTgTreeShell.refreshTgDetailByTgId(planId, tgId)) return true;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.scheduleRender === 'function') {
            vb.scheduleRender();
            return true;
        }
        return false;
    }

    global.JmsTgIfMountRefresh = {
        patchIfMountRowsInDom: patchIfMountRowsInDom,
        markDirtyAndRefresh: markDirtyAndRefresh
    };
}(typeof window !== 'undefined' ? window : this));
