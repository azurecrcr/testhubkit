/**
 * catalog 取样器挂载 · 添加后刷新修复（DebugSampler 等非 HTTP 取样器）
 */
(function (global) {
    'use strict';

    function isCatalogSamplerMount(insertCtx, planId, tgId, samplerId) {
        if (!samplerId || !insertCtx) return false;
        if (!(insertCtx.httpMount || insertCtx.context === 'sampler_child' || insertCtx.context === 'sampler')) {
            return false;
        }
        var R = global.JmsMountHostResolver;
        var vb = global.JmsVisualBuilder;
        if (!R || !vb || typeof vb.getModel !== 'function') return false;
        var host = R.findMountHostStep(vb.getModel(), planId, tgId, samplerId);
        return !!(host && R.isCatalogSamplerMountHost(host) && !host.method);
    }

    function refreshCatalogSamplerMount(planId, tgId, samplerId) {
        if (!planId || !tgId || !samplerId) return false;
        if (global.JmsCatalogSamplerMountRefresh &&
            typeof global.JmsCatalogSamplerMountRefresh.patchByStepId === 'function') {
            if (global.JmsCatalogSamplerMountRefresh.patchByStepId(planId, tgId, samplerId)) return true;
        }
        if (global.JmsTgIfMountRefresh &&
            typeof global.JmsTgIfMountRefresh.markDirtyAndRefresh === 'function') {
            return global.JmsTgIfMountRefresh.markDirtyAndRefresh(planId, tgId, samplerId);
        }
        return false;
    }

    function patchPostAdd() {
        var PA = global.JmsCatalogPostAdd;
        if (!PA || PA.__catalogSamplerMountRefreshPatched) return;
        PA.__catalogSamplerMountRefreshPatched = true;
        var orig = PA.refreshAfterSave;
        PA.refreshAfterSave = function (vb, planId, tgId, step, insertCtx) {
            insertCtx = insertCtx || {};
            var samplerId = insertCtx.parentStepId;
            var catalogSampler = isCatalogSamplerMount(insertCtx, planId, tgId, samplerId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            if (catalogSampler && samplerId) {
                global.setTimeout(function () {
                    refreshCatalogSamplerMount(planId, tgId, samplerId);
                    var card = global.document.querySelector(
                        '.jms-aux-card--debug.jms-catalog-card[data-step-id="' + samplerId + '"],' +
                        ' .jms-catalog-card--sampler[data-step-id="' + samplerId + '"]'
                    );
                    if (card && card.classList.contains('jms-catalog-card--collapsed') &&
                        global.JmsCatalogCardToggle && typeof global.JmsCatalogCardToggle.toggleCard === 'function') {
                        global.JmsCatalogCardToggle.toggleCard(card);
                    }
                }, 80);
            }
        };
    }

    function patchAppend() {
        var SC = global.JmsCatalogSamplerChildren;
        if (!SC || SC.__catalogSamplerMountAppendPatched) return;
        SC.__catalogSamplerMountAppendPatched = true;
        var orig = SC.appendUnderMountHost;
        if (typeof orig !== 'function') return;
        SC.appendUnderMountHost = function (vb, planId, tgId, hostStepId, stepData) {
            var item = orig.apply(this, arguments);
            if (!item) return item;
            var host = SC.findMountHostStep(vb.getModel(), planId, tgId, hostStepId);
            if (host && global.JmsMountCatalogBridge) {
                var idx = (host.catalog_hash_children || []).length - 1;
                if (idx >= 0) {
                    var key = global.JmsMountCatalogBridge.hashMountKey(item, idx);
                    if (global.JmsIfMountTimeline && typeof global.JmsIfMountTimeline.assignAppendMountKey === 'function') {
                        global.JmsIfMountTimeline.assignAppendMountKey(host, key);
                    }
                    if (global.JmsIfMountSaveHelper && typeof global.JmsIfMountSaveHelper.notifyMountAdded === 'function') {
                        global.JmsIfMountSaveHelper.notifyMountAdded(host, key);
                    }
                }
            }
            return item;
        };
    }

    function patchBridgeV2Allow() {
        var B = global.JmsStudioCatalogBridgeV2;
        if (!B || B.__catalogSamplerAllowPatched) return;
        B.__catalogSamplerAllowPatched = true;
        var orig = B.isAllowedForMount;
        if (typeof orig !== 'function') return;
        B.isAllowedForMount = function (comp, ctx, category) {
            if (ctx && ctx.httpMount && ctx.parentStepId &&
                isCatalogSamplerMount(ctx, ctx.planId, ctx.tgId, ctx.parentStepId)) {
                if (global.JmsHierarchyRules && typeof global.JmsHierarchyRules.componentAllowed === 'function') {
                    return global.JmsHierarchyRules.componentAllowed(comp, 'sampler_child');
                }
                return true;
            }
            return orig.apply(this, arguments);
        };
    }

    function patchMenuBridge() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || Menu.__catalogMountMenuPriorityPatched) return;
        Menu.__catalogMountMenuPriorityPatched = true;
        var origOpen = Menu.openPopup;
        if (typeof origOpen !== 'function') return;
        Menu.openPopup = function (anchor, ctx, category, title, hit, triggerKey) {
            if (ctx && ctx.httpMount && ctx.parentStepId) {
                var R = global.JmsMountHostResolver;
                var vb = global.JmsVisualBuilder;
                if (R && vb && typeof vb.getModel === 'function') {
                    var host = R.findMountHostStep(vb.getModel(), ctx.planId, ctx.tgId, ctx.parentStepId);
                    if (host && R.isCatalogSamplerMountHost(host) && !host.method) {
                        ctx = Object.assign({}, ctx, {
                            context: 'sampler_child',
                            label: '取样器',
                            httpMount: true
                        });
                    }
                }
            }
            return origOpen.call(Menu, anchor, ctx, category, title, hit, triggerKey);
        };
    }

    function bind() {
        patchPostAdd();
        patchAppend();
        patchBridgeV2Allow();
        patchMenuBridge();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogSamplerMountPostAddFix = { bind: bind };
})(window);
