/**
 * catalog 深层嵌套 · 深度上限（对齐 JMeter GUI 可嵌套语义，防止异常深树）
 */
(function (global) {
    'use strict';

    var MAX_CONTROLLER_DEPTH = 48;

    function toast(msg) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(msg, { variant: 'error', placement: 'bottom' });
        }
    }

    function findTgSteps(vb, planId, tgId) {
        if (!vb || typeof vb.getModel !== 'function') return null;
        var CA = global.JmsCatalogContextAppend;
        if (!CA || typeof CA.findTg !== 'function') return null;
        var tg = CA.findTg(vb.getModel(), planId, tgId);
        return tg && tg.steps ? tg.steps : null;
    }

    function depthOfStep(steps, stepId, depth) {
        if (!steps || !stepId) return -1;
        depth = depth || 0;
        var i, s, nested;
        for (i = 0; i < steps.length; i += 1) {
            s = steps[i];
            if (!s) continue;
            if (String(s.id) === String(stepId)) return depth;
            if (Array.isArray(s.children) && s.children.length) {
                nested = depthOfStep(s.children, stepId, depth + 1);
                if (nested >= 0) return nested;
            }
        }
        return -1;
    }

    function wouldExceed(parentStepId, planId, tgId) {
        var vb = global.JmsVisualBuilder;
        var steps = findTgSteps(vb, planId, tgId);
        if (!steps || !parentStepId) return false;
        var d = depthOfStep(steps, parentStepId, 0);
        return d >= 0 && d + 1 >= MAX_CONTROLLER_DEPTH;
    }

    function patchTreeAppend() {
        var TA = global.JmsCatalogControllerTreeChildAppend;
        if (!TA || TA.__depthGuardV1) return;
        TA.__depthGuardV1 = true;
        var orig = TA.append;
        TA.append = function (vb, step, ctx) {
            ctx = ctx || {};
            if (wouldExceed(ctx.parentStepId, ctx.planId, ctx.tgId)) {
                toast('逻辑控制器嵌套已达上限（' + MAX_CONTROLLER_DEPTH + ' 层），请减少嵌套深度');
                return null;
            }
            return orig.apply(this, arguments);
        };
    }

    function patchContextAppend() {
        var CA = global.JmsCatalogContextAppend;
        if (!CA || CA.__depthGuardV1) return;
        CA.__depthGuardV1 = true;
        var orig = CA.appendCatalogAtContext;
        CA.appendCatalogAtContext = function (vb, stepData, insertCtx) {
            insertCtx = insertCtx || {};
            if (insertCtx.context === 'controller' && insertCtx.parentStepId &&
                wouldExceed(insertCtx.parentStepId, insertCtx.planId, insertCtx.tgId)) {
                toast('逻辑控制器嵌套已达上限（' + MAX_CONTROLLER_DEPTH + ' 层），请减少嵌套深度');
                return { ok: false, error: 'max_depth' };
            }
            return orig.apply(this, arguments);
        };
    }

    function bind() {
        patchTreeAppend();
        patchContextAppend();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogNestedDepthGuard = { MAX_CONTROLLER_DEPTH: MAX_CONTROLLER_DEPTH };
})(window);
