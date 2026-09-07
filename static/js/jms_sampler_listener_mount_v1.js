/**
 * 取样器挂载 · 官方监听器菜单放行（隔离模块）
 * 背景：catalog HTTPSamplerProxy 常无 step.method，会被 sampler_mount_post_add_fix
 * 改走 HierarchyRules.sampler_child（禁止 listener）导致菜单为空。
 * 本模块仅放宽取样器挂载菜单/添加白名单，不改 HierarchyRules 与 TG 级监听器。
 */
(function (global) {
    'use strict';

    var VER = '20260715sampler-listener1';

    /** 官方 / 常用可挂到取样器下的监听器 alias */
    var SAMPLER_LISTENER_ALLOW = {
        ViewResultsFullVisualizer: 1,
        StatVisualizer: 1,
        SummaryReport: 1,
        ResultCollector: 1,
        BackendListener: 1,
        GraphVisualizer: 1,
        TableVisualizer: 1,
        SimpleDataWriter: 1,
        MailerResultCollector: 1,
        JSR223Listener: 1,
        BeanShellListener: 1,
        Summariser: 1,
        ResultAction: 1
    };

    function isSamplerMountCtx(ctx) {
        if (!ctx) return false;
        if (ctx.httpMount) return true;
        var c = String(ctx.context || '');
        return c === 'sampler_child' || c === 'sampler';
    }

    function isListenerComp(comp, category) {
        if (category === 'listener') return true;
        return !!(comp && String(comp.category || '') === 'listener');
    }

    function allowedSamplerListener(comp) {
        if (!comp) return false;
        var alias = String(comp.alias || '');
        if (SAMPLER_LISTENER_ALLOW[alias]) return true;
        // 其余 listener 类别也允许（对齐 JMeter：取样器可挂监听器）
        return String(comp.category || '') === 'listener';
    }

    function patchBridgeAllow() {
        var B = global.JmsStudioCatalogBridgeV2;
        if (!B || typeof B.isAllowedForMount !== 'function' || B.__samplerListenerMountV1) return false;
        B.__samplerListenerMountV1 = true;
        var orig = B.isAllowedForMount.bind(B);
        B.isAllowedForMount = function (comp, ctx, category) {
            if (isSamplerMountCtx(ctx) && isListenerComp(comp, category) && allowedSamplerListener(comp)) {
                return true;
            }
            return orig(comp, ctx, category);
        };
        return true;
    }

    /** 目录已加载但缺 GUI 别名时，前端旁路补齐（双保险） */
    function patchMenuCatalogInject() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || typeof Menu.loadCatalog !== 'function' || Menu.__samplerListenerCatalogInjectV1) return false;
        Menu.__samplerListenerCatalogInjectV1 = true;
        var orig = Menu.loadCatalog.bind(Menu);
        Menu.loadCatalog = function (cb) {
            return orig(function (err) {
                try {
                    if (!err && Menu.getCatalogState) {
                        /* no-op, state private */
                    }
                    // 通过打开前注入：劫持 filterComps 更稳
                } catch (e1) { /* ignore */ }
                if (typeof cb === 'function') cb(err);
            });
        };
        return true;
    }

    function patchFilterComps() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || Menu.__samplerListenerFilterV1) return false;
        // filterComps 未导出；依赖 isAllowedForMount 已足够
        Menu.__samplerListenerFilterV1 = true;
        return true;
    }

    function bind() {
        patchBridgeAllow();
        patchMenuCatalogInject();
        patchFilterComps();
    }

    function boot(n) {
        n = n || 0;
        bind();
        if ((!global.JmsStudioCatalogBridgeV2 || !global.JmsStudioCatalogBridgeV2.__samplerListenerMountV1) && n < 80) {
            setTimeout(function () { boot(n + 1); }, 50);
        }
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', function () { boot(0); });
    } else {
        boot(0);
    }
    global.addEventListener('pageshow', function () { boot(0); });

    global.JmsSamplerListenerMountV1 = {
        VER: VER,
        SAMPLER_LISTENER_ALLOW: SAMPLER_LISTENER_ALLOW,
        allowedSamplerListener: allowedSamplerListener,
        isSamplerMountCtx: isSamplerMountCtx,
        bind: bind
    };
})(typeof window !== 'undefined' ? window : this);
