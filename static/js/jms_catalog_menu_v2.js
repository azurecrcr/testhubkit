/**
 * JMeter Studio V2 · 统一 catalog 菜单（劫持 TG / HTTP / 逻辑控制器挂载区工具栏）
 */
(function (global) {
    'use strict';

    var VER = '20260708mountadd5';
    var catalogState = { loaded: false, loading: false, components: [], hierarchy: null, templates: {} };

    var PLAN_HIJACKS = [
        { wrap: '.jms-plan-catalog-more--listener', trigger: '.jms-plan-catalog-trigger--listener', menu: '.jms-plan-catalog-menu--listener', category: 'listener', label: '监听器' },
        { wrap: '.jms-plan-catalog-more--config', trigger: '.jms-plan-catalog-trigger--config', menu: '.jms-plan-catalog-menu--config', category: 'config', label: '配置元件' },
        { wrap: '.jms-plan-catalog-more--other', trigger: '.jms-plan-catalog-trigger--other', menu: '.jms-plan-catalog-menu--other', category: 'other', label: '其他元件' }
    ];

    var TG_HIJACKS = [
        { wrap: '.jms-tg-config-more', trigger: '.jms-tg-config-trigger', menu: '.jms-tg-config-menu', category: 'config', label: '配置元件' },
        { wrap: '.jms-tg-post-proc-more', trigger: '.jms-tg-post-proc-trigger', menu: '.jms-tg-post-proc-menu', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-tg-logic-ctrl-more', trigger: '.jms-tg-logic-ctrl-trigger', menu: '.jms-tg-logic-ctrl-menu', category: 'controller', label: '逻辑控制器' },
        { wrap: '.jms-tg-sampler-more', trigger: '.jms-tg-sampler-trigger', menu: '.jms-tg-sampler-menu', category: 'sampler', label: '取样器' },
        { wrap: '.jms-tg-assert-more', trigger: '.jms-tg-assert-trigger', menu: '.jms-tg-assert-menu', category: 'assertion', label: '断言' },
        { wrap: '.jms-tg-listener-more', trigger: '.jms-tg-listener-menu-trigger', menu: '.jms-tg-listener-menu', category: 'listener', label: '监听器' }
    ];

    var HTTP_HIJACKS = [
        { wrap: '.jms-http-ctx-proc-more', trigger: '.jms-http-ctx-btn-processors', menu: '.jms-http-ctx-proc-menu', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-http-ctx-preproc-more', trigger: '.jms-http-ctx-btn-preprocessors, .jms-http-ctx-btn-preproc', menu: '.jms-http-ctx-preproc-menu', category: 'preprocessor', label: '前置处理器' },
        { wrap: '.jms-http-ctx-timer-more', trigger: '.jms-http-ctx-btn-timers', menu: '.jms-http-ctx-timer-menu', category: 'timer', label: '定时器' },
        { wrap: '.jms-http-ctx-config-more', trigger: '.jms-http-ctx-btn-config', menu: '.jms-http-ctx-config-menu', category: 'config', label: '配置元件' },
        { wrap: '.jms-http-ctx-assert-more', trigger: '.jms-http-ctx-btn-assert-menu', menu: '.jms-http-ctx-assert-menu', category: 'assertion', label: '断言' },
        { wrap: '.jms-http-ctx-listener-more', trigger: '.jms-http-ctx-btn-listeners', menu: '.jms-http-ctx-listener-menu', category: 'listener', label: '监听器' },
        { wrap: '.jms-http-ctx-logic-more', trigger: '.jms-http-ctx-btn-logic', menu: '.jms-http-ctx-logic-menu', category: 'controller', label: '逻辑控制器' }
    ];

    var CTRL_HIJACKS = [
        { wrap: '.jms-if-mount-ctx-sampler-more', trigger: '.jms-if-mount-ctx-btn-sampler', menu: '.jms-if-mount-ctx-menu', category: 'sampler', label: '取样器' },
        { wrap: '.jms-if-mount-ctx-logic-more', trigger: '.jms-if-mount-ctx-btn-logic', menu: '.jms-if-mount-ctx-menu', category: 'controller', label: '逻辑控制器' },
        { wrap: '.jms-if-mount-ctx-assert-more', trigger: '.jms-if-mount-ctx-btn-assert', menu: '.jms-if-mount-ctx-menu', category: 'assertion', label: '断言' },
        { wrap: '.jms-if-mount-ctx-timer-more', trigger: '.jms-if-mount-ctx-btn-timer', menu: '.jms-if-mount-ctx-menu', category: 'timer', label: '定时器' },
        { wrap: '.jms-if-mount-ctx-preproc-more', trigger: '.jms-if-mount-ctx-btn-preproc', menu: '.jms-if-mount-ctx-menu', category: 'preprocessor', label: '前置处理器' },
        { wrap: '.jms-if-mount-ctx-proc-more', trigger: '.jms-if-mount-ctx-btn-processors', menu: '.jms-if-mount-ctx-menu', category: 'postprocessor', label: '后置处理器' },
        { wrap: '.jms-if-mount-ctx-config-more', trigger: '.jms-if-mount-ctx-btn-config', menu: '.jms-if-mount-ctx-menu', category: 'config', label: '配置元件' },
        { wrap: '.jms-if-mount-ctx-listener-more', trigger: '.jms-if-mount-ctx-btn-listeners', menu: '.jms-if-mount-ctx-menu', category: 'listener', label: '监听器' }
    ];

    var TG_CHIP_CATS = [
        { category: 'preprocessor', label: '前置处理器' },
        { category: 'timer', label: '定时器' }
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function isActive() {
        return global.document.body.classList.contains('lth-jmeter-catalog-v2') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function ensureBodyClass() {
        if (global.document.body.classList.contains('lth-hub-jmeter-tab')) {
            global.document.body.classList.add('lth-jmeter-catalog-v2');
        }
    }

    function injectCss() {
        if (global.document.getElementById('jms-v2-catalog-menu-css')) return;
        var link = global.document.createElement('link');
        link.id = 'jms-v2-catalog-menu-css';
        link.rel = 'stylesheet';
        link.href = '/static/css/jms_catalog_menu_v2.css?v=' + VER;
        global.document.head.appendChild(link);
    }

    function loadCatalog(cb) {
        if (catalogState.loaded) { cb(null); return; }
        if (catalogState.loading) {
            setTimeout(function () { loadCatalog(cb); }, 80);
            return;
        }
        catalogState.loading = true;
        fetch('/api/jmeter-scenario/component-catalog', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d || !d.ok) throw new Error((d && d.error) || 'catalog 加载失败');
                catalogState.components = d.components || [];
                catalogState.hierarchy = d.hierarchy || d.placement || null;
                catalogState.templates = d.templates || {};
                catalogState.loaded = true;
                cb(null);
            })
            .catch(cb)
            .finally(function () { catalogState.loading = false; });
    }

    function filterComps(ctx, category) {
        var list = catalogState.components || [];
        var bridge = global.JmsStudioCatalogBridgeV2;
        var effCat = global.JmsHierarchyRules && typeof global.JmsHierarchyRules.effectiveCategory === 'function'
            ? function (c) { return global.JmsHierarchyRules.effectiveCategory(c, ctx.context); }
            : function (c) { return c.category; };
        return list.filter(function (c) {
            if (category && effCat(c) !== category) return false;
            if (bridge && typeof bridge.isAllowedForMount === 'function') {
                return bridge.isAllowedForMount(c, ctx, category);
            }
            if (global.JmsHierarchyRules && typeof global.JmsHierarchyRules.componentAllowed === 'function') {
                return global.JmsHierarchyRules.componentAllowed(c, ctx.context);
            }
            return true;
        });
    }

    function clipBottomForAnchor(anchor) {
        var margin = 8;
        var clip = global.innerHeight - margin;
        var footer = global.document.querySelector('.hf-site-footer, footer[data-hf-footer]');
        if (footer) {
            var ft = footer.getBoundingClientRect().top;
            if (ft > 0) clip = Math.min(clip, ft - margin);
        }
        var workspace = anchor.closest('.lth-studio-workspace') ||
            global.document.querySelector('.lth-studio-workspace, #jms-visual-wrap');
        if (workspace) {
            var wb = workspace.getBoundingClientRect().bottom;
            if (wb > 0) clip = Math.min(clip, wb - margin);
        }
        var tgBlock = anchor.closest('.jms-tg-block--tree, .jms-plan-card');
        if (tgBlock) {
            var tb = tgBlock.getBoundingClientRect().bottom;
            if (tb > 0) clip = Math.min(clip, tb - margin);
        }
        return Math.max(margin + 80, clip);
    }

    function positionPopup(anchor, pop) {
        var margin = 8;
        var rect = anchor.getBoundingClientRect();
        var clipBottom = clipBottomForAnchor(anchor);
        var spaceBelow = clipBottom - rect.bottom - margin;
        var spaceAbove = rect.top - margin;
        var maxH = Math.max(100, Math.max(spaceBelow, spaceAbove) - margin);
        pop.style.maxHeight = maxH + 'px';
        pop.style.overflowY = 'hidden';
        var left = Math.min(rect.left, global.innerWidth - pop.offsetWidth - margin);
        var top = rect.bottom + 4;
        if (top + pop.offsetHeight > clipBottom && spaceAbove > spaceBelow) {
            top = rect.top - pop.offsetHeight - 4;
            pop.classList.add('jms-v2-catalog-popup--dropup');
        } else {
            pop.classList.remove('jms-v2-catalog-popup--dropup');
        }
        if (top < margin) top = margin;
        pop.style.left = Math.max(margin, left) + 'px';
        pop.style.top = top + 'px';
    }

    var NATIVE_MORE_SEL = '.jms-tg-config-more, .jms-tg-logic-ctrl-more, .jms-tg-sampler-more, .jms-tg-post-proc-more, .jms-tg-assert-more, .jms-tg-listener-more,' +
        ' .jms-http-ctx-proc-more, .jms-http-ctx-preproc-more, .jms-http-ctx-timer-more, .jms-http-ctx-config-more, .jms-http-ctx-assert-more, .jms-http-ctx-listener-more, .jms-http-ctx-logic-more,' +
        ' .jms-if-mount-ctx-sampler-more, .jms-if-mount-ctx-logic-more, .jms-if-mount-ctx-assert-more, .jms-if-mount-ctx-timer-more, .jms-if-mount-ctx-preproc-more, .jms-if-mount-ctx-proc-more, .jms-if-mount-ctx-config-more, .jms-if-mount-ctx-listener-more';
    var NATIVE_MENU_ITEM_SEL = '.jms-http-ctx-proc-item, .jms-http-ctx-preproc-item, .jms-http-ctx-timer-item, .jms-http-ctx-config-item, .jms-http-ctx-assert-item, .jms-http-ctx-listener-item, .jms-http-ctx-logic-item,' +
        ' .jms-if-mount-ctx-item, .jms-tg-post-proc-item, .jms-tg-logic-ctrl-item, .jms-tg-sampler-item, .jms-tg-assert-item, .jms-tg-listener-item';

    function isInsideNativeFallbackClick(t) {
        if (!t || !t.closest) return false;
        var openWrap = t.closest('.jms-v2-native-fallback.is-open');
        if (!openWrap) return false;
        if (t.closest(NATIVE_MENU_ITEM_SEL)) return true;
        if (t.closest('[class*="-menu"]')) return true;
        return false;
    }


    function closeNativeMoreWrap(wrap) {
        if (!wrap) return;
        wrap.classList.remove('is-open', 'jms-v2-native-fallback');
        wrap.removeAttribute('data-v2-native-fallback');
        var tr = wrap.querySelector('[aria-haspopup="true"], button');
        if (tr) tr.setAttribute('aria-expanded', 'false');
        var menu = wrap.querySelector('[role="menu"]');
        if (menu) menu.setAttribute('aria-hidden', 'true');
    }

    function closeAllNativeTgMenus() {
        global.document.querySelectorAll(NATIVE_MORE_SEL + '.is-open').forEach(closeNativeMoreWrap);
    }

    function closePopup() {
        var p = global.document.getElementById('jms-v2-catalog-popup');
        if (p) p.remove();
        global.document.body.classList.remove('jms-v2-catalog-popup-open');
    }

    function closeAllDropdowns() {
        closePopup();
        closeAllNativeTgMenus();
    }

    function isScrollInsidePopup(ev) {
        var pop = global.document.getElementById('jms-v2-catalog-popup');
        if (!pop || !ev) return false;
        var target = ev.target;
        if (!target || target.nodeType !== 1) return false;
        return pop === target || pop.contains(target);
    }

    function bindPopupScrollShield(pop) {
        if (!pop || pop.dataset.jmsV2ScrollShield === '1') return;
        pop.dataset.jmsV2ScrollShield = '1';
        var bodyEl = pop.querySelector('.jms-v2-catalog-popup__body');
        if (bodyEl) {
            bodyEl.addEventListener('scroll', function (ev) { ev.stopPropagation(); }, true);
        }
    }

    function toggleNativeMenuFallback(wrap, menuSel) {
        return false;
    }

    function openPopup(anchor, ctx, category, title, hit, triggerKey) {
        closeAllDropdowns();
        loadCatalog(function (err) {
            if (err) {
                if (hit && hit.wrap && hit.menu && anchor) {
                    var fbWrap = anchor.closest(hit.wrap);
                    if (fbWrap && toggleNativeMenuFallback(fbWrap, hit.menu)) {
                        if (typeof global.hfFloatToast === 'function') {
                            global.hfFloatToast('元件目录暂不可用，已切换本地菜单', { variant: 'warning' });
                        }
                        return;
                    }
                }
                if (typeof global.hfFloatToast === 'function') {
                    global.hfFloatToast(err.message || String(err), { variant: 'error' });
                }
                return;
            }
            var items = filterComps(ctx, category);
            if (!items.length && hit && hit.wrap && hit.menu && anchor) {
                var emptyWrap = anchor.closest(hit.wrap);
                if (emptyWrap && toggleNativeMenuFallback(emptyWrap, hit.menu)) {
                    if (typeof global.hfFloatToast === 'function') {
                        global.hfFloatToast('元件目录暂无匹配项，已切换本地菜单', { variant: 'warning' });
                    }
                    return;
                }
            }
            var pop = global.document.createElement('div');
            pop.id = 'jms-v2-catalog-popup';
            pop.className = 'jms-v2-catalog-popup';
            pop.setAttribute('role', 'menu');
            var head = '<div class="jms-v2-catalog-popup__head">' + esc(title) + ' · ' + esc(ctx.label || ctx.context) +
                ' <span class="jms-v2-catalog-popup__n">(' + items.length + ')</span></div>';
            var body = items.length
                ? items.map(function (c) {
                    return '<button type="button" class="jms-v2-catalog-popup__item" data-alias="' + esc(c.alias) + '">' +
                        esc(c.label_zh || c.alias) + '</button>';
                }).join('')
                : '<p class="jms-v2-catalog-popup__empty">当前层级无可用元件</p>';
            pop.innerHTML = head + '<div class="jms-v2-catalog-popup__body">' + body + '</div>';
            if (triggerKey) pop.dataset.triggerKey = triggerKey;
            global.document.body.appendChild(pop);
            global.document.body.classList.add('jms-v2-catalog-popup-open');
            bindPopupScrollShield(pop);
            pop.__jmsAnchorEl = anchor;
            if (global.JmsJmeterCatalogPopupAnchorFix && typeof global.JmsJmeterCatalogPopupAnchorFix.bindPopup === 'function') {
                global.JmsJmeterCatalogPopupAnchorFix.bindPopup(pop, anchor);
            }
            positionPopup(anchor, pop);
            pop.addEventListener('click', function (ev) {
                var btn = ev.target.closest('.jms-v2-catalog-popup__item');
                if (!btn) return;
                ev.stopPropagation();
                var alias = btn.getAttribute('data-alias');
                var comp = (catalogState.components || []).filter(function (x) { return x.alias === alias; })[0];
                if (comp && global.JmsStudioCatalogBridgeV2) {
                    global.JmsStudioCatalogBridgeV2.addComponent(comp, ctx, catalogState);
                }
                closePopup();
            });
        });
    }

    function ctxFromPlanCatalogWrap(wrap) {
        if (!wrap) return null;
        var planId = wrap.getAttribute('data-plan-id');
        if (!planId) {
            var vb = global.JmsVisualBuilder;
            var m = vb && typeof vb.getModel === 'function' ? vb.getModel() : null;
            if (m && m.test_plans && m.test_plans[0]) planId = m.test_plans[0].id;
        }
        return {
            context: 'test_plan',
            label: '测试计划',
            planId: planId,
            tgId: null,
            parentStepId: null
        };
    }

    function ctxFromHttpWrap(wrap) {
        var httpCtx = wrap.closest('.jms-http-context');
        if (!httpCtx) return null;
        return {
            context: 'sampler_child',
            label: '取样器',
            planId: httpCtx.getAttribute('data-plan-id'),
            tgId: httpCtx.getAttribute('data-tg-id'),
            parentStepId: httpCtx.getAttribute('data-step-id'),
            httpMount: true
        };
    }

    function ctxFromControllerWrap(wrap) {
        var mountCtx = wrap.closest('.jms-if-mount-context, .jms-catalog-mount-context');
        if (!mountCtx) return null;
        var parentStepId = mountCtx.getAttribute('data-if-step-id') ||
            mountCtx.getAttribute('data-catalog-step-id') || '';
        if (!parentStepId) return null;
        return {
            context: 'controller',
            label: '逻辑控制器',
            planId: mountCtx.getAttribute('data-plan-id'),
            tgId: mountCtx.getAttribute('data-tg-id'),
            parentStepId: parentStepId,
            controllerMount: true
        };
    }

    function ctxFromTgToolbarWrap(wrap, trigger) {
        if (!wrap) return null;
        var host = wrap.closest('.jms-tg-tools, .jms-tg-tree-head, .jms-tg-tree-head-add');
        if (!host && !(trigger && trigger.classList && trigger.classList.contains('jms-tg-config-btn'))) return null;
        var planId = (trigger && trigger.getAttribute('data-plan-id')) || wrap.getAttribute('data-plan-id');
        var tgId = (trigger && trigger.getAttribute('data-tg-id')) || wrap.getAttribute('data-tg-id');
        if (!planId || !tgId) {
            var block = wrap.closest('.jms-tg-block, .jms-tg-block--tree');
            if (block) {
                planId = planId || block.getAttribute('data-plan-id');
                tgId = tgId || block.getAttribute('data-tg-id');
            }
        }
        if (!planId || !tgId) return null;
        return {
            context: 'thread_group',
            label: '线程组',
            planId: planId,
            tgId: tgId,
            parentStepId: null
        };
    }

    function resolveContext(wrap, trigger) {
        var planWrap = (wrap && wrap.closest('.jms-plan-catalog-more')) ||
            (trigger && trigger.closest('.jms-plan-catalog-more'));
        if (planWrap) return ctxFromPlanCatalogWrap(planWrap);
        var ctrl = ctxFromControllerWrap(wrap);
        if (ctrl) return enrichCtx(ctrl, wrap);
        var tg = ctxFromTgToolbarWrap(wrap, trigger);
        if (tg) return enrichCtx(tg, wrap);
        var http = ctxFromHttpWrap(wrap);
        if (http) return enrichCtx(http, wrap);
        var vb = global.JmsVisualBuilder;
        if (global.JmsInsertContextV2 && vb) {
            return enrichCtx(global.JmsInsertContextV2.resolve(vb), wrap);
        }
        return enrichCtx({
            context: 'thread_group',
            label: '线程组',
            planId: wrap.getAttribute('data-plan-id'),
            tgId: wrap.getAttribute('data-tg-id'),
            parentStepId: null
        }, wrap);
    }

    function enrichCtx(ctx, wrap) {
        ctx = ctx || {};
        if (ctx.planId && ctx.tgId) return ctx;
        var block = wrap && wrap.closest
            ? wrap.closest('.jms-tg-block--tree, .jms-tg-block, .jms-http-context, .jms-if-mount-context')
            : null;
        if (block) {
            ctx.planId = ctx.planId || block.getAttribute('data-plan-id');
            ctx.tgId = ctx.tgId || block.getAttribute('data-tg-id');
        }
        if ((!ctx.planId || !ctx.tgId) && global.JmsVisualBuilder &&
            typeof global.JmsVisualBuilder.resolveActiveThreadGroupContext === 'function') {
            var active = global.JmsVisualBuilder.resolveActiveThreadGroupContext();
            if (active) {
                ctx.planId = ctx.planId || active.planId;
                ctx.tgId = ctx.tgId || active.tgId;
            }
        }
        return ctx;
    }

    function matchHijack(t) {
        var i;
        for (i = 0; i < PLAN_HIJACKS.length; i += 1) {
            if (t.closest(PLAN_HIJACKS[i].trigger)) return PLAN_HIJACKS[i];
        }
        for (i = 0; i < TG_HIJACKS.length; i += 1) {
            if (t.closest(TG_HIJACKS[i].trigger)) return TG_HIJACKS[i];
        }
        for (i = 0; i < HTTP_HIJACKS.length; i += 1) {
            if (t.closest(HTTP_HIJACKS[i].trigger)) return HTTP_HIJACKS[i];
        }
        for (i = 0; i < CTRL_HIJACKS.length; i += 1) {
            if (t.closest(CTRL_HIJACKS[i].trigger)) return CTRL_HIJACKS[i];
        }
        return null;
    }

    function onCaptureClick(ev) {
        if (!isActive()) return;
        var t = ev.target;
        if (t.closest('#jms-v2-catalog-popup')) return;
        var hit = matchHijack(t);
        if (!hit) {
            if (!isInsideNativeFallbackClick(t)) {
                closeAllDropdowns();
            }
            return;
        }
        var trigger = t.closest(hit.trigger);
        if (!trigger) return;
        var wrap = t.closest(hit.wrap);
        if (!wrap) return;
        var existingPop = global.document.getElementById('jms-v2-catalog-popup');
        var triggerKey = (wrap.getAttribute('data-plan-id') || '') + ':' + (wrap.getAttribute('data-tg-id') || '') + ':' + hit.category + ':' + (trigger.className || '');
        if (existingPop && existingPop.dataset.triggerKey === triggerKey) {
            closeAllDropdowns();
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            return;
        }
        if (wrap.classList.contains('is-open') && !existingPop && wrap.classList.contains('jms-v2-native-fallback')) {
            closeNativeMoreWrap(wrap);
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            return;
        }
        closeAllDropdowns();
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        var ctx = resolveContext(wrap, trigger);
        openPopup(trigger, ctx, hit.category, hit.label, hit, triggerKey);
    }

    function injectTgChips() {
        if (!global.document.body.classList.contains('lth-tg-view-tree')) return;
        global.document.querySelectorAll('.jms-tg-tree-head-add:not([data-v2-chips])').forEach(function (row) {
            row.setAttribute('data-v2-chips', '1');
            var wrap = global.document.createElement('span');
            wrap.className = 'jms-v2-add-wrap';
            TG_CHIP_CATS.forEach(function (cat) {
                var b = global.document.createElement('button');
                b.type = 'button';
                b.className = 'jms-v2-add-btn';
                b.textContent = '+' + cat.label.replace('处理器', '');
                b.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    var ctx = resolveContext(row.closest('.jms-tg-tree-head') || row);
                    openPopup(b, ctx, cat.category, cat.label);
                });
                wrap.appendChild(b);
            });
            row.appendChild(wrap);
        });
    }

    function markHijacked(list) {
        list.forEach(function (h) {
            global.document.querySelectorAll(h.wrap + ':not([data-v2-hijack])').forEach(function (el) {
                el.setAttribute('data-v2-hijack', '1');
                var menu = el.querySelector(h.menu);
                if (menu) menu.setAttribute('aria-hidden', 'true');
            });
        });
    }

    function init() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        ensureBodyClass();
        injectCss();
        if (!global.document.documentElement.dataset.jmsV2CatalogCapture) {
            global.document.documentElement.dataset.jmsV2CatalogCapture = '1';
            global.document.addEventListener('click', onCaptureClick, true);
            global.addEventListener('resize', closePopup);
            global.addEventListener('scroll', function (ev) {
                if (isScrollInsidePopup(ev)) return;
                if (global.JmsJmeterDropdownScrollGuard &&
                    typeof global.JmsJmeterDropdownScrollGuard.shouldKeepOpenOnScroll === 'function' &&
                    global.JmsJmeterDropdownScrollGuard.shouldKeepOpenOnScroll(ev)) {
                    return;
                }
                closeAllDropdowns();
            }, true);
        }
        markHijacked(PLAN_HIJACKS);
        markHijacked(TG_HIJACKS);
        markHijacked(HTTP_HIJACKS);
        markHijacked(CTRL_HIJACKS);
        injectTgChips();
        var root = global.document.getElementById('jms-plans-container');
        if (root && !root.dataset.jmsV2Obs) {
            root.dataset.jmsV2Obs = '1';
            new MutationObserver(function () {
                markHijacked(PLAN_HIJACKS);
        markHijacked(TG_HIJACKS);
                markHijacked(HTTP_HIJACKS);
                markHijacked(CTRL_HIJACKS);
                injectTgChips();
            }).observe(root, { childList: true, subtree: true });
        }
    }

    global.JmsCatalogMenuV2 = {
        init: init,
        closePopup: closePopup,
        closeAllDropdowns: closeAllDropdowns,
        closeAllNativeTgMenus: closeAllNativeTgMenus,
        loadCatalog: loadCatalog,
        filterComps: filterComps,
        positionPopup: positionPopup,
        openPopup: openPopup,
        toggleNativeMenuFallback: toggleNativeMenuFallback,
        isInsideNativeFallbackClick: isInsideNativeFallbackClick,
        getState: function () { return catalogState; },
        VERSION: VER
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    global.addEventListener('pageshow', init);
})(window);
