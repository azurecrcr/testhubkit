/**
 * JMeter Studio V2 · catalog 添加桥接（统一 catalog_element 弹窗，仅 HTTP 请求走原生）
 */
(function (global) {
    'use strict';

    var SAMPLER_ALIAS_HTTP = { HTTPSamplerProxy: 1, HTTPSampler: 1, HTTPSampler2: 1 };

    var HTTP_MOUNT_ALLOWED = {
        listener: {
            ViewResultsFullVisualizer: 1,
            ResultCollector: 1,
            StatVisualizer: 1,
            SummaryReport: 1,
            BackendListener: 1
        },
        controller: { IfController: 1 }
    };

    function toast(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error' });
        }
    }

    function isAllowedForMount(comp, ctx, category) {
        if (!comp) return false;
        if (ctx.httpMount && category && HTTP_MOUNT_ALLOWED[category]) {
            return !!HTTP_MOUNT_ALLOWED[category][comp.alias];
        }
        if (global.JmsHierarchyRules && typeof global.JmsHierarchyRules.componentAllowed === 'function') {
            return global.JmsHierarchyRules.componentAllowed(comp, ctx.context);
        }
        return true;
    }

    function allowed(comp, ctx) {
        return isAllowedForMount(comp, ctx, comp.category);
    }

    function legacyCtx(ctx) {
        var out = Object.assign({}, ctx);
        if (out.context === 'sampler_child') out.context = 'sampler';
        return out;
    }

    function catalogTemplatesFromState(state) {
        return (state && state.templates) || {};
    }

    function appendCatalogFallback(comp, ctx, state) {
        var Bridge = global.JmsStudioCatalogBridge;
        var vb = global.JmsVisualBuilder;
        if (!Bridge || !vb) return { ok: false };
        var st = Object.assign({}, state || {});
        if (!st.templates) st.templates = catalogTemplatesFromState(st);
        var legacy = legacyCtx(ctx);
        if (typeof Bridge.appendCatalogElement === 'function') {
            var direct = Bridge.appendCatalogElement(vb, comp, legacy, st);
            if (direct && (direct.ok || direct.error)) return direct;
        }
        if (typeof Bridge.addCatalogComponent === 'function') {
            return Bridge.addCatalogComponent(comp, legacy, st);
        }
        return { ok: false };
    }

    function addComponent(comp, ctx, state) {
        var vb = global.JmsVisualBuilder;
        if (!vb || !comp) return { ok: false };
        if (!isAllowedForMount(comp, ctx, comp.category)) {
            toast('当前层级不可添加：' + (comp.label_zh || comp.alias), false);
            return { ok: false, error: 'not_allowed' };
        }

        if (comp.category === 'sampler' && SAMPLER_ALIAS_HTTP[comp.alias]) {
            return appendCatalogFallback(comp, ctx, state || {});
        }

        var res = appendCatalogFallback(comp, ctx, state || {});
        if (res && res.ok) {
            if (!(res.pending || res.mode === 'pending_create')) {
                toast('已添加：' + (comp.label_zh || comp.alias), true);
            }
            return res;
        }

        toast('添加失败：' + (comp.label_zh || comp.alias), false);
        return { ok: false, error: (res && res.error) || 'append_failed' };
    }

    global.JmsStudioCatalogBridgeV2 = {
        addComponent: addComponent,
        allowed: allowed,
        isAllowedForMount: isAllowedForMount
    };
})(window);
