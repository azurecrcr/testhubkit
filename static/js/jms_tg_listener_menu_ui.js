/**
 * 树形视图 · 线程组监听器下拉菜单（隔离模块，仅 lth-tg-view-tree）
 */
(function (global) {
    'use strict';

    var DEFAULT_LS = { view_results_tree: false, aggregate_report: false, backend_listener: false };


    function isCatalogV2Active() {
        return global.document.body.classList.contains('lth-jmeter-catalog-v2') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function findPlan(model, planId) {
        return (model.test_plans || []).find(function (p) { return p.id === planId; });
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = findPlan(model, planId);
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function anyListenerOn(ls) {
        ls = ls || DEFAULT_LS;
        return !!(ls.view_results_tree || ls.aggregate_report || ls.backend_listener);
    }

    function patchMenuUi(wrap, listeners) {
        if (!wrap) return;
        listeners = listeners || DEFAULT_LS;
        var trigger = wrap.querySelector('.jms-tg-listener-menu-trigger');
        if (trigger) trigger.classList.toggle('is-on', anyListenerOn(listeners));
        wrap.querySelectorAll('.jms-tg-listener-menu-item[data-listener]').forEach(function (item) {
            var key = item.getAttribute('data-listener');
            var on = !!(listeners && listeners[key]);
            item.classList.toggle('is-on', on);
            item.setAttribute('aria-checked', on ? 'true' : 'false');
        });
    }

    function closePeerMenus() {
        global.document.querySelectorAll(
            '.jms-http-ctx-listener-more.is-open, .jms-http-ctx-preproc-more.is-open,' +
            ' .jms-http-ctx-proc-more.is-open, .jms-http-ctx-timer-more.is-open,' +
            ' .jms-http-ctx-config-more.is-open, .lth-tg-add-more.is-open, .jms-tg-logic-ctrl-more.is-open, .jms-tg-post-proc-more.is-open, .jms-tg-sampler-more.is-open'
        ).forEach(function (el) {
            el.classList.remove('is-open');
        });
    }

    function closeMenus(except) {
        global.document.querySelectorAll('.jms-tg-listener-more.is-open').forEach(function (el) {
            if (el !== except) {
                el.classList.remove('is-open');
                var tr = el.querySelector('.jms-tg-listener-menu-trigger');
                if (tr) tr.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function closeAllMenus() {
        closeMenus(null);
    }

    function markDirty() {
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function onDocumentClick(ev) {
        if (!isTreeView()) return;
        if (isCatalogV2Active()) return;
        var t = ev.target;

        var trigger = t.closest('.jms-tg-listener-menu-trigger');
        if (trigger) {
            ev.preventDefault();
            ev.stopPropagation();
            var wrap = trigger.closest('.jms-tg-listener-more');
            if (!wrap) return;
            var open = wrap.classList.contains('is-open');
            closePeerMenus();
            closeMenus(wrap);
            wrap.classList.toggle('is-open', !open);
            trigger.setAttribute('aria-expanded', !open ? 'true' : 'false');
            return;
        }

        var menuItem = t.closest('.jms-tg-listener-menu-item');
        if (menuItem) {
            ev.preventDefault();
            ev.stopPropagation();
            var w = menuItem.closest('.jms-tg-listener-more');
            if (!w) return;
            var planId = w.getAttribute('data-plan-id');
            var tgId = w.getAttribute('data-tg-id');
            var key = menuItem.getAttribute('data-listener');
            if (!planId || !tgId || !key) return;
            if (global.JmsTgListenerCatalogBridge && typeof global.JmsTgListenerCatalogBridge.openEditor === 'function') {
                closeMenus(w);
                global.JmsTgListenerCatalogBridge.openEditor(planId, tgId, key);
                var vbOpen = global.JmsVisualBuilder;
                if (vbOpen && typeof vbOpen.syncYamlFromModel === 'function') vbOpen.syncYamlFromModel();
                markDirty();
                if (vbOpen && typeof vbOpen.getModel === 'function') {
                    var tgOpen = findTg(vbOpen.getModel(), planId, tgId);
                    var flagsOpen = global.JmsTgListenerCatalogBridge.getListenerFlags
                        ? global.JmsTgListenerCatalogBridge.getListenerFlags(tgOpen)
                        : (tgOpen && tgOpen.listeners);
                    patchMenuUi(w, flagsOpen || DEFAULT_LS);
                }
                if (global.JmsTgListenerTreeRows && typeof global.JmsTgListenerTreeRows.refreshTgTree === 'function') {
                    global.JmsTgListenerTreeRows.refreshTgTree(planId, tgId);
                }
                return;
            }

            var vb = global.JmsVisualBuilder;
            if (!vb || typeof vb.getModel !== 'function') return;
            var model = vb.getModel();
            var tg = findTg(model, planId, tgId);
            if (!tg) return;
            if (global.JmsTgListenerCatalogBridge && typeof global.JmsTgListenerCatalogBridge.toggleListener === 'function') {
                global.JmsTgListenerCatalogBridge.toggleListener(planId, tgId, key);
            } else {
                if (!tg.listeners) tg.listeners = Object.assign({}, DEFAULT_LS);
                tg.listeners[key] = !tg.listeners[key];
                if (tg.listeners[key] && global.JmsTgListenerTimeline && typeof global.JmsTgListenerTimeline.assignAppendTimelineOrder === 'function') {
                    global.JmsTgListenerTimeline.assignAppendTimelineOrder(tg, key);
                }
            }
            if (typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
            markDirty();
            var flags = global.JmsTgListenerCatalogBridge && typeof global.JmsTgListenerCatalogBridge.getListenerFlags === 'function'
                ? global.JmsTgListenerCatalogBridge.getListenerFlags(tg)
                : tg.listeners;
            patchMenuUi(w, flags);
            if (global.JmsTgListenerTreeRows && typeof global.JmsTgListenerTreeRows.refreshTgTree === 'function') {
                global.JmsTgListenerTreeRows.refreshTgTree(planId, tgId);
            }
            return;
        }

        if (!t.closest('.jms-tg-listener-more')) closeAllMenus();
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsTgListenerMenuBound === '1') return;
        global.document.body.dataset.jmsTgListenerMenuBound = '1';
        global.document.addEventListener('click', onDocumentClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgListenerMenuUi = {
        closeAllMenus: closeAllMenus,
        patchMenuUi: patchMenuUi,
        anyListenerOn: anyListenerOn
    };
})(window);
