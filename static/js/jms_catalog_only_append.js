/**
 * 线程组/控制器层级 · 仅通过官方 catalog 添加元件（不走 legacy auxType 分支）
 */
(function (global) {
    'use strict';

    var HTTP_ALIASES = { HTTPSamplerProxy: 1, HTTPSampler: 1, HTTPSampler2: 1 };

    function toast(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error' });
        }
    }

    function auxToAlias(auxType) {
        if (auxType === 'http_request') return 'HTTPSamplerProxy';
        var M = global.JmsCatalogUnifyMigrate;
        if (M && M.AUX_TO_ALIAS && M.AUX_TO_ALIAS[auxType]) return M.AUX_TO_ALIAS[auxType];
        return '';
    }

    function findComponent(alias) {
        alias = String(alias || '');
        if (!alias) return null;
        var st = global.JmsCatalogMenuV2 && global.JmsCatalogMenuV2.getState
            ? global.JmsCatalogMenuV2.getState()
            : null;
        if (st && Array.isArray(st.components)) {
            for (var i = 0; i < st.components.length; i += 1) {
                var c = st.components[i];
                if (c && c.alias === alias) return c;
            }
        }
        return {
            alias: alias,
            testclass: alias,
            label_zh: alias,
            category: HTTP_ALIASES[alias] ? 'sampler' : 'other',
            container: false
        };
    }

    function buildInsertCtx(opts) {
        opts = opts || {};
        var ctx = {
            planId: opts.planId,
            tgId: opts.tgId,
            parentStepId: opts.parentStepId || null,
            context: 'thread_group',
            label: '线程组'
        };
        if (ctx.parentStepId) {
            ctx.context = 'controller';
            ctx.label = '逻辑控制器';
            ctx.controllerMount = true;
        }
        return ctx;
    }

    function append(opts) {
        opts = opts || {};
        var alias = opts.alias || auxToAlias(opts.auxType);
        if (!alias) {
            toast('未知元件类型', false);
            return { ok: false };
        }
        var Bridge = global.JmsStudioCatalogBridgeV2;
        if (!Bridge || typeof Bridge.addComponent !== 'function') {
            toast('官方元件菜单未就绪', false);
            return { ok: false };
        }
        var comp = findComponent(alias);
        var st = global.JmsCatalogMenuV2 && global.JmsCatalogMenuV2.getState
            ? global.JmsCatalogMenuV2.getState()
            : {};
        return Bridge.addComponent(comp, buildInsertCtx(opts), st || {}) || { ok: false };
    }

    global.JmsCatalogOnlyAppend = {
        append: append,
        auxToAlias: auxToAlias
    };
})(typeof window !== 'undefined' ? window : this);
