/**
 * catalog 取样器 · 挂载行局部刷新（展开卡片 / 删除后，二/三/四级嵌套）
 */
(function (global) {
    'use strict';

    var R = function () { return global.JmsMountHostResolver; };
    var M = function () { return global.JmsIfMountModel; };

    function findCatalogSamplerCard(stepsEl, stepId) {
        if (!stepsEl || !stepId) return null;
        return stepsEl.querySelector(
            '.jms-catalog-card--sampler[data-step-id="' + stepId + '"],' +
            ' .jms-aux-card--debug.jms-catalog-card[data-step-id="' + stepId + '"]'
        );
    }

    function resolveMountDepth(stepsEl, stepId, fallbackDepth) {
        if (!stepsEl || !stepId) return fallbackDepth || 1;
        var node = stepsEl.querySelector('.jms-tree-node--catalog[data-step-id="' + stepId + '"]');
        if (!node) return fallbackDepth || 1;
        return (parseInt(node.getAttribute('data-depth') || '0', 10) || 0) + 1;
    }

    function patchCatalogSamplerMountsInDom(stepsEl, step, planId, tgId) {
        if (!stepsEl || !step || !step.id) return false;
        var card = findCatalogSamplerCard(stepsEl, step.id);
        if (!card) return false;
        var body = card.querySelector(':scope > .jms-catalog-card__body');
        if (!body) return false;
        var Rows = global.JmsTgIfMountTreeRows;
        if (!Rows || typeof Rows.renderRows !== 'function') return false;
        if (M() && typeof M().ensureMountFields === 'function') step = M().ensureMountFields(step);
        var depth = resolveMountDepth(stepsEl, step.id, 1);
        Array.prototype.slice.call(body.querySelectorAll(':scope > .jms-tree-node--if-mount, :scope > .jms-empty-hint.jms-catalog-card__empty')).forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        var html = Rows.renderRows(step, planId, tgId, depth, step.id);
        if (html) {
            body.insertAdjacentHTML('beforeend', html);
            return true;
        }
        if (!body.querySelector(':scope > .jms-tree-node')) {
            body.insertAdjacentHTML('beforeend', '<p class="jms-empty-hint jms-catalog-card__empty">暂无挂载元件</p>');
        }
        return true;
    }

    function patchByStepId(planId, tgId, stepId) {
        if (!planId || !tgId || !stepId) return false;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        if (!card) return false;
        var stepsEl = card.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        var model = global.JmsVisualBuilder && global.JmsVisualBuilder.getModel ? global.JmsVisualBuilder.getModel() : null;
        if (!R() || typeof R().findMountHostStep !== 'function') return false;
        var step = R().findMountHostStep(model, planId, tgId, stepId);
        if (!step || !R().isCatalogSamplerMountHost(step)) return false;
        return patchCatalogSamplerMountsInDom(stepsEl, step, planId, tgId);
    }

    function onCatalogCardExpanded(card) {
        if (!card || card.classList.contains('jms-catalog-card--collapsed')) return;
        var stepId = card.getAttribute('data-step-id');
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        if (!stepId) return;
        global.setTimeout(function () { patchByStepId(planId, tgId, stepId); }, 0);
    }

    function hookCatalogToggle() {
        var T = global.JmsCatalogCardToggle;
        if (!T || T.__catalogSamplerMountPatched) return;
        T.__catalogSamplerMountPatched = true;
        var origToggle = T.toggleCard;
        if (typeof origToggle === 'function') {
            T.toggleCard = function (card) {
                origToggle.call(T, card);
                if (card && !card.classList.contains('jms-catalog-card--collapsed')) onCatalogCardExpanded(card);
            };
        }
    }

    function bind() { hookCatalogToggle(); }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogSamplerMountRefresh = {
        patchCatalogSamplerMountsInDom: patchCatalogSamplerMountsInDom,
        patchByStepId: patchByStepId,
        onCatalogCardExpanded: onCatalogCardExpanded
    };
})(window);
