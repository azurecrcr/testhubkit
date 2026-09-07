/**
 * JMeter catalog · 添加后刷新 UI（仅在用户保存后调用）
 */
(function (global) {
    'use strict';

    function sid(v) {
        if (global.JmsCatalogRefresh && typeof global.JmsCatalogRefresh.sid === 'function') {
            return global.JmsCatalogRefresh.sid(v);
        }
        return v == null ? '' : String(v);
    }

    function findTg(model, planId, tgId) {
        if (global.JmsCatalogContextAppend && typeof global.JmsCatalogContextAppend.findTg === 'function') {
            return global.JmsCatalogContextAppend.findTg(model, planId, tgId);
        }
        return null;
    }

    function assignTimelineOrder(vb, planId, tgId, step) {
        if (!vb || !step) return;
        var tg = findTg(vb.getModel(), planId, tgId);
        if (!tg) return;
        var TL = global.JmsTgDetailTimeline;
        if (TL && typeof TL.assignAppendTimelineOrder === 'function') {
            TL.assignAppendTimelineOrder(tg, step);
        }
    }

    function assignHttpMountKey(step, childIndex) {
        if (!step || childIndex == null) return;
        var TL = global.JmsHttpMountTimeline;
        if (TL && typeof TL.assignAppendMountKey === 'function') {
            TL.assignAppendMountKey(step, 'cat:' + childIndex);
        }
    }

    function refreshAfterSave(vb, planId, tgId, step, insertCtx) {
        insertCtx = insertCtx || {};
        if (!vb || !step) return;

        if (insertCtx.context === 'test_plan') {
            if (typeof vb.triggerRender === 'function') vb.triggerRender();
            else if (typeof vb.scheduleRender === 'function') vb.scheduleRender();
            return;
        }

        if (insertCtx.context !== 'sampler' && !insertCtx.httpMount && insertCtx.context !== 'sampler_child') {
            assignTimelineOrder(vb, planId, tgId, step);
        }

        if (global.JmsCatalogRefresh && typeof global.JmsCatalogRefresh.refreshStepsArea === 'function') {
            global.JmsCatalogRefresh.refreshStepsArea(vb, planId, tgId);
        } else if (typeof vb.triggerRender === 'function') {
            vb.triggerRender();
        } else if (typeof vb.scheduleRender === 'function') {
            vb.scheduleRender();
        }

        var samplerId = insertCtx.parentStepId;
        var isHttpChild = insertCtx.httpMount || insertCtx.context === 'sampler_child' || insertCtx.context === 'sampler';
        if (isHttpChild && samplerId) {
            global.setTimeout(function () {
                if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.selectHttp === 'function') {
                    global.JmsHttpContextUi.selectHttp(planId, tgId, samplerId);
                }
            }, 60);
        }

        if (global.JmsCatalogCardToggle && typeof global.JmsCatalogCardToggle.applyState === 'function') {
            global.setTimeout(function () {
                var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + sid(planId) + '"]');
                if (card) global.JmsCatalogCardToggle.applyState(card);
            }, 80);
        }
    }

    /** @deprecated 仅兼容旧调用；新流程请用 refreshAfterSave */
    function refreshAfterAdd(vb, planId, tgId, step, insertCtx) {
        refreshAfterSave(vb, planId, tgId, step, insertCtx);
    }

    global.JmsCatalogPostAdd = {
        refreshAfterSave: refreshAfterSave,
        refreshAfterAdd: refreshAfterAdd,
        assignTimelineOrder: assignTimelineOrder,
        assignHttpMountKey: assignHttpMountKey
    };
})(window);
