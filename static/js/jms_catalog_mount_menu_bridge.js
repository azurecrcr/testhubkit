/**
 * JMeter catalog · 挂载区菜单桥接（扩展 CatalogMenuV2，隔离模块）
 */
(function (global) {
    'use strict';

    var CATALOG_MOUNT_HIJACKS = [
        { wrap: '.jms-catalog-mount-ctx-sampler-more', trigger: '.jms-catalog-mount-ctx-btn-sampler', category: 'sampler', label: '取样器' },
        { wrap: '.jms-catalog-mount-ctx-logic-more', trigger: '.jms-catalog-mount-ctx-btn-logic', category: 'controller', label: '逻辑控制器' },
        { wrap: '.jms-catalog-mount-ctx-config-more', trigger: '.jms-catalog-mount-ctx-btn-config', category: 'config', label: '配置元件' },
        { wrap: '.jms-catalog-mount-ctx-preproc-more', trigger: '.jms-catalog-mount-ctx-btn-preproc', category: 'preprocessor', label: '前置处理器' },
        { wrap: '.jms-catalog-mount-ctx-timer-more', trigger: '.jms-catalog-mount-ctx-btn-timer', category: 'timer', label: '定时器' },
        { wrap: '.jms-catalog-mount-ctx-proc-more', trigger: '.jms-catalog-mount-ctx-btn-processors', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-catalog-mount-ctx-assert-more', trigger: '.jms-catalog-mount-ctx-btn-assert', category: 'assertion', label: '断言' },
        { wrap: '.jms-catalog-mount-ctx-listener-more', trigger: '.jms-catalog-mount-ctx-btn-listeners', category: 'listener', label: '监听器' }
    ];

    function ctxFromCatalogMountWrap(wrap) {
        var mountCtx = wrap && wrap.closest ? wrap.closest('.jms-catalog-mount-context') : null;
        if (!mountCtx) return null;
        var mode = mountCtx.getAttribute('data-catalog-mount-mode') || '';
        var stepId = mountCtx.getAttribute('data-catalog-step-id') || mountCtx.getAttribute('data-if-step-id') || '';
        if (!stepId) return null;
        if (mode === 'sampler') {
            return {
                context: 'sampler_child',
                label: '取样器',
                planId: mountCtx.getAttribute('data-plan-id'),
                tgId: mountCtx.getAttribute('data-tg-id'),
                parentStepId: stepId,
                httpMount: true
            };
        }
        if (mode === 'controller') {
            return {
                context: 'controller',
                label: '逻辑控制器',
                planId: mountCtx.getAttribute('data-plan-id'),
                tgId: mountCtx.getAttribute('data-tg-id'),
                parentStepId: stepId,
                controllerMount: true
            };
        }
        return null;
    }

    function patchMenuV2() {
        var Menu = global.JmsCatalogMenuV2;
        if (!Menu || Menu.__catalogMountBridgePatched) return;
        Menu.__catalogMountBridgePatched = true;

        var origInit = Menu.init;
        Menu.init = function () {
            if (typeof origInit === 'function') origInit.apply(this, arguments);
            CATALOG_MOUNT_HIJACKS.forEach(function (h) {
                global.document.querySelectorAll(h.wrap + ':not([data-v2-hijack])').forEach(function (el) {
                    el.setAttribute('data-v2-hijack', '1');
                    var menu = el.querySelector('.jms-catalog-mount-ctx-menu');
                    if (menu) menu.setAttribute('aria-hidden', 'true');
                });
            });
        };

        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-jmeter-catalog-v2')) return;
            var t = ev.target;
            var hit = null;
            CATALOG_MOUNT_HIJACKS.forEach(function (h) {
                if (!hit && t.closest(h.trigger)) hit = h;
            });
            if (!hit) return;
            var wrap = t.closest(hit.wrap);
            var trigger = t.closest(hit.trigger);
            if (!wrap || !trigger) return;
            var ctx = ctxFromCatalogMountWrap(wrap);
            if (!ctx) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            var triggerKey = (ctx.planId || '') + ':' + (ctx.tgId || '') + ':' + hit.category + ':catalog-mount:' + (ctx.parentStepId || '');
            if (typeof Menu.openPopup === 'function') {
                Menu.openPopup(trigger, ctx, hit.category, hit.label, {
                    wrap: hit.wrap,
                    menu: '.jms-catalog-mount-ctx-menu',
                    trigger: hit.trigger
                }, triggerKey);
            } else if (typeof Menu.loadCatalog === 'function') {
                Menu.loadCatalog(function (err) {
                    if (err) {
                        if (typeof global.hfFloatToast === 'function') {
                            global.hfFloatToast('元件目录暂不可用', { variant: 'warning' });
                        }
                        return;
                    }
                });
            }
        }, true);
    }

    function bind() {
        patchMenuV2();
        if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.init === 'function') {
            global.JmsCatalogMenuV2.init();
        }
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        setTimeout(bind, 80);
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogMountMenuBridge = { bind: bind, ctxFromCatalogMountWrap: ctxFromCatalogMountWrap };
})(window);
