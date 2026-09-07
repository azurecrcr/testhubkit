/**
 * catalog 逻辑控制器挂载区 · 添加配置/定时器等后局部刷新（深层嵌套）
 */
(function (global) {
    'use strict';

    function isControllerMountAux(insertCtx, step) {
        if (!insertCtx || !insertCtx.controllerMount || !insertCtx.parentStepId || !step) return false;
        var TA = global.JmsCatalogControllerTreeChildAppend;
        if (TA && typeof TA.isTreeChild === 'function' && TA.isTreeChild(step)) return false;
        return true;
    }

    function refreshHostBody(planId, tgId, hostStepId) {
        if (!planId || !tgId || !hostStepId) return false;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        var vb = global.JmsVisualBuilder;
        var R = global.JmsMountHostResolver;
        var Rows = global.JmsTgIfMountTreeRows;
        if (!vb || !R || !Rows || typeof Rows.patchIfBodyInDom !== 'function') return false;
        var host = R.findMountHostStep(vb.getModel(), planId, tgId, hostStepId);
        if (!host) return false;
        return Rows.patchIfBodyInDom(stepsEl, host, planId, tgId, '');
    }

    function patchPostAdd() {
        var PA = global.JmsCatalogPostAdd;
        if (!PA || PA.__controllerMountPostAddV1) return;
        PA.__controllerMountPostAddV1 = true;
        var orig = PA.refreshAfterSave;
        PA.refreshAfterSave = function (vb, planId, tgId, step, insertCtx) {
            insertCtx = insertCtx || {};
            var hostId = insertCtx.parentStepId;
            var needPatch = isControllerMountAux(insertCtx, step);
            if (typeof orig === 'function') orig.apply(this, arguments);
            if (needPatch && hostId) {
                global.setTimeout(function () { refreshHostBody(planId, tgId, hostId); }, 60);
                global.setTimeout(function () { refreshHostBody(planId, tgId, hostId); }, 180);
            }
        };
    }

    function bind() { patchPostAdd(); }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogControllerMountPostAdd = { refreshHostBody: refreshHostBody };
})(window);
