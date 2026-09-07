/**
 * If 控制器挂载区 · children 子步骤 DOM 局部刷新（隔离模块）
 * 修复：保存逻辑控制器/取样器后底部列表未更新（mount rows 刷新不会重绘 children）
 */
(function (global) {
    'use strict';

    var Model = function () { return global.JmsIfMountModel; };

    function findPlanCard(planId) {
        if (!planId) return null;
        return global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
    }

    function resolveIfChildDepth(stepsEl, ifStepId, fallbackDepth) {
        if (!stepsEl || !ifStepId) return fallbackDepth || 1;
        var ifNode = stepsEl.querySelector('.jms-tree-node--if[data-step-id="' + ifStepId + '"], .jms-tree-node--random[data-step-id="' + ifStepId + '"], .jms-tree-node--simple[data-step-id="' + ifStepId + '"], .jms-tree-node--transaction[data-step-id="' + ifStepId + '"], .jms-tree-node--loop[data-step-id="' + ifStepId + '"]');
        if (!ifNode) return fallbackDepth || 1;
        return (parseInt(ifNode.getAttribute('data-depth') || '0', 10) || 0) + 1;
    }

    function patchIfChildrenInDom(planId, tgId, ifStepId) {
        if (!planId || !tgId || !ifStepId) return false;
        if (!Model() || typeof Model().findLogicMountStep !== 'function') return false;
        var ifStep = Model().findLogicMountStep(planId, tgId, ifStepId);
        if (!ifStep) return false;
        if (Model().ensureMountFields) ifStep = Model().ensureMountFields(ifStep);
        var card = findPlanCard(planId);
        if (!card) return false;
        var stepsEl = card.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        if (global.JmsTgIfMountTreeRows && typeof global.JmsTgIfMountTreeRows.patchIfBodyInDom === 'function') {
            return global.JmsTgIfMountTreeRows.patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
        }
        return false;
    }

    global.JmsTgIfMountChildrenPatch = {
        patchIfChildrenInDom: patchIfChildrenInDom
    };
}(typeof window !== 'undefined' ? window : this));
