/**
 * JMeter 压测 · 线程组树形工作台壳层（隔离模块）
 */
(function (global) {
    'use strict';

    var STORAGE_VIEW = 'lth_tg_view_mode';
    var STORAGE_ACTIVE = 'lth_tg_tree_active';
    var navSwitching = false;
    var syncTimer = null;

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree');
    }

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function readActiveMap() {
        try {
            var raw = global.sessionStorage.getItem(STORAGE_ACTIVE);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function writeActiveMap(map) {
        try {
            global.sessionStorage.setItem(STORAGE_ACTIVE, JSON.stringify(map));
        } catch (e) { /* ignore */ }
    }

    function getActiveKey(planId) {
        return readActiveMap()[planId] || '';
    }

    function setActiveKey(planId, key) {
        var map = readActiveMap();
        map[planId] = key;
        writeActiveMap(map);
    }

    function resolveActiveKey(model, planId) {
        var groups = global.JmsTgTreeRenderer.collectThreadGroups(model, planId);
        var activeKey = getActiveKey(planId);
        if (!activeKey || !groups.some(function (g) { return g.key === activeKey; })) {
            activeKey = groups.length ? groups[0].key : '';
            if (activeKey) setActiveKey(planId, activeKey);
        }
        return activeKey;
    }

    function syncTreeNameToLegacy(card) {
        var main = card.querySelector('.jms-tg-tree-main .jms-tg-block--tree');
        if (!main) return;
        var tgId = main.getAttribute('data-tg-id');
        var nameEl = main.querySelector('.jms-tg-name');
        if (!nameEl || !tgId) return;
        var legacy = card.querySelector('.jms-plan-tgs--legacy .jms-tg-block[data-tg-id="' + tgId + '"]');
        if (legacy) {
            var legacyName = legacy.querySelector('.jms-tg-name');
            if (legacyName) legacyName.value = nameEl.value;
        }
    }

    function applyIfCollapseState(card) {
        var T = global.JmsLogicCtrlCardToggle;
        if (T && typeof T.applyState === 'function') T.applyState(card);
        var C = global.JmsCatalogCardToggle;
        if (C && typeof C.applyState === 'function') C.applyState(card);
    }

    function updateNavActive(host, activeKey) {
        host.querySelectorAll('.jms-tg-tree-nav__item').forEach(function (btn) {
            var on = btn.getAttribute('data-tg-key') === activeKey;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-current', on ? 'true' : 'false');
        });
    }

    function getDetailScrollEl(card) {
        return card && card.querySelector('.jms-tg-tree-steps');
    }

    function scrollPreserveApi() {
        return global.JmsTgTreeScrollPreserve;
    }

    function replaceDetailPanel(card, planId, activeKey, selectedHttpStepId, opts) {
        opts = opts || {};
        if (!card || !global.JmsTgTreeRenderer) return;
        var model = getModel();
        if (!model) return;
        var host = card.querySelector('.jms-tg-tree-host');
        if (!host) return;
        var SP = scrollPreserveApi();
        var snap = (opts.preserveScroll && SP && SP.capture) ? SP.capture(card) : null;
        var wrap = global.document.createElement('div');
        wrap.innerHTML = global.JmsTgTreeRenderer.renderDetailPanel(model, planId, activeKey, selectedHttpStepId);
        var nextMain = wrap.firstElementChild;
        var curMain = host.querySelector('.jms-tg-tree-main');
        if (curMain && nextMain) {
            curMain.replaceWith(nextMain);
        } else if (nextMain && host.querySelector('.jms-tg-tree-workspace')) {
            host.querySelector('.jms-tg-tree-workspace').appendChild(nextMain);
        }
        if (snap && SP && SP.restore) SP.restore(card, snap);
        applyIfCollapseState(card);
        if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.ensureBind === 'function') {
            global.JmsHttpContextUi.ensureBind();
        }

    }

    function refreshHttpContext(card, planId) {
        if (!card || !global.JmsTgTreeRenderer) return;
        navSwitching = true;
        try {
            syncTreeNameToLegacy(card);
            var model = getModel();
            if (!model) return;
            var activeKey = resolveActiveKey(model, planId);
            var active = global.JmsTgTreeRenderer.findActiveGroup(model, planId, activeKey);
            if (!active) return;
            var tgId = active.tg.id;
            var stepId = global.JmsHttpContextUi && typeof global.JmsHttpContextUi.getSelected === 'function'
                ? (global.JmsHttpContextUi.getSelected(planId, tgId) || '')
                : '';
            if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.patchSelectionInDom === 'function') {
                if (global.JmsHttpContextUi.patchSelectionInDom(card, planId, tgId, stepId)) {
                    if (stepId && global.JmsHttpContextUi.findHttpStep) {
                        var httpStep = global.JmsHttpContextUi.findHttpStep(model, planId, tgId, stepId);
                        var stepsEl = card.querySelector('.jms-tg-tree-steps');
                        if (httpStep && stepsEl && global.JmsHttpMountTreeRows &&
                            typeof global.JmsHttpMountTreeRows.patchMountChildrenInDom === 'function') {
                            global.JmsHttpMountTreeRows.patchMountChildrenInDom(stepsEl, httpStep, planId, tgId);
                        }
                    }
                    return;
                }
            }
            replaceDetailPanel(card, planId, activeKey, stepId || undefined, { preserveScroll: true });
        } finally {
            global.setTimeout(function () { navSwitching = false; }, 40);
        }
    }

    function switchThreadGroup(card, planId, activeKey) {
        if (!card || !global.JmsTgTreeRenderer) return;
        var model = getModel();
        if (!model) return;

        navSwitching = true;
        try {
            syncTreeNameToLegacy(card);
            setActiveKey(planId, activeKey);
            if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.clearPlan === 'function') {
                global.JmsHttpContextUi.clearPlan(planId);
            }

            var host = card.querySelector('.jms-tg-tree-host');
            if (!host) return;

            updateNavActive(host, activeKey);
            replaceDetailPanel(card, planId, activeKey);
        } finally {
            global.setTimeout(function () { navSwitching = false; }, 80);
        }
    }

    function syncPlanCard(card, forceFull) {
        if (!global.JmsTgTreeRenderer) return;
        var planId = card.getAttribute('data-plan-id');
        if (!planId) return;
        var model = getModel();
        if (!model) return;

        syncTreeNameToLegacy(card);

        var legacy = card.querySelector('.jms-plan-tgs');
        if (legacy) legacy.classList.add('jms-plan-tgs--legacy');

        var host = card.querySelector('.jms-tg-tree-host');
        if (!host) {
            host = global.document.createElement('div');
            host.className = 'jms-tg-tree-host';
            card.appendChild(host);
            forceFull = true;
        }

        var activeKey = resolveActiveKey(model, planId);

        if (host.querySelector('.jms-tg-tree-workspace')) {
            var ws = host.querySelector('.jms-tg-tree-workspace');
            if (forceFull && global.JmsTgTreeRenderer.renderNav) {
                var oldNav = ws.querySelector('.jms-tg-tree-nav');
                var oldList = oldNav && oldNav.querySelector('.jms-tg-tree-nav__list');
                var scrollTop = oldList ? oldList.scrollTop : 0;
                var navWrap = global.document.createElement('div');
                navWrap.innerHTML = global.JmsTgTreeRenderer.renderNav(model, planId, activeKey);
                var nextNav = navWrap.firstElementChild;
                if (oldNav && nextNav) {
                    oldNav.replaceWith(nextNav);
                    var newList = nextNav.querySelector('.jms-tg-tree-nav__list');
                    if (newList) newList.scrollTop = scrollTop;
                }
            } else {
                updateNavActive(host, activeKey);
            }
            var SP = scrollPreserveApi();
            var detailSnap = SP && SP.capture ? SP.capture(card) : null;
            var wrap = global.document.createElement('div');
            wrap.innerHTML = global.JmsTgTreeRenderer.renderDetailPanel(model, planId, activeKey);
            var nextMain = wrap.firstElementChild;
            var curMain = host.querySelector('.jms-tg-tree-main');
            if (curMain && nextMain) curMain.replaceWith(nextMain);
            if (detailSnap && SP && SP.restore) SP.restore(card, detailSnap);
            applyIfCollapseState(card);
            if (global.JmsTgNavViewport && typeof global.JmsTgNavViewport.syncAll === 'function') {
                global.JmsTgNavViewport.syncAll();
            }
            return;
        }

        var SPws = scrollPreserveApi();
        var wsSnap = SPws && SPws.capture ? SPws.capture(card) : null;
        host.innerHTML = global.JmsTgTreeRenderer.renderWorkspace(model, planId, activeKey);
        if (wsSnap && SPws && SPws.restore) SPws.restore(card, wsSnap);
        applyIfCollapseState(card);
        if (global.JmsTgNavViewport && typeof global.JmsTgNavViewport.syncAll === 'function') {
            global.JmsTgNavViewport.syncAll();
        }
    }

    function scheduleSyncAll(forceFull) {
        if (!isTreeView() || !isJmeterTab() || navSwitching) return;
        if (syncTimer) global.clearTimeout(syncTimer);
        syncTimer = global.setTimeout(function () {
            syncTimer = null;
            if (navSwitching) return;
            var container = global.document.getElementById('jms-plans-container');
            if (!container) return;
            container.querySelectorAll('.jms-plan-card').forEach(function (card) {
                syncPlanCard(card, !!forceFull);
            });
        }, 60);
    }

    function refreshTgDetailByTgId(planId, tgId) {
        if (!isTreeView() || !isJmeterTab() || !planId || !tgId) return false;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        if (!card || !global.JmsTgTreeRenderer) return false;
        var model = getModel();
        if (!model) return false;
        var groups = global.JmsTgTreeRenderer.collectThreadGroups(model, planId);
        var group = groups.find(function (g) { return g.tg && String(g.tg.id) === String(tgId); });
        if (!group) return false;
        var stepId = global.JmsHttpContextUi && typeof global.JmsHttpContextUi.getSelected === 'function'
            ? (global.JmsHttpContextUi.getSelected(planId, tgId) || '')
            : '';
        replaceDetailPanel(card, planId, group.key, stepId || undefined, { preserveScroll: true });
        return true;
    }

    function syncAll(forceFull) {
        if (!isTreeView() || !isJmeterTab()) return;
        var container = global.document.getElementById('jms-plans-container');
        if (!container) return;
        container.querySelectorAll('.jms-plan-card').forEach(function (card) {
            syncPlanCard(card, !!forceFull);
        });
    }

    function setTreeView(on) {
        if (!on) return;
        global.document.body.classList.add('lth-tg-view-tree');
        try {
            global.sessionStorage.setItem(STORAGE_VIEW, 'tree');
        } catch (e) { /* ignore */ }
        syncAll(true);
    }

    function triggerLegacyTgDelete(card, planId, tgId) {
        if (!card || !planId || !tgId) return false;
        syncTreeNameToLegacy(card);
        var legacy = card.querySelector('.jms-plan-tgs--legacy .jms-tg-block[data-tg-id="' + tgId + '"]');
        if (!legacy) return false;
        var legacyDel = legacy.querySelector('.jms-btn-del-tg');
        if (!legacyDel) return false;
        navSwitching = true;
        legacyDel.click();
        global.setTimeout(function () { navSwitching = false; }, 200);
        return true;
    }

    function onNavDeleteClick(ev) {
        var delBtn = ev.target.closest('.jms-tg-tree-nav__del');
        if (!delBtn || !isTreeView()) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }

        var card = delBtn.closest('.jms-plan-card');
        var planId = delBtn.getAttribute('data-plan-id');
        var tgId = delBtn.getAttribute('data-tg-id');
        triggerLegacyTgDelete(card, planId, tgId);
    }

    function onNavClick(ev) {
        if (ev.target.closest('.jms-tg-tree-nav__del')) return;

        var navItem = ev.target.closest('.jms-tg-tree-nav__item');
        if (!navItem || !isTreeView()) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }

        var card = navItem.closest('.jms-plan-card');
        var planId = navItem.getAttribute('data-plan-id');
        var key = navItem.getAttribute('data-tg-key');
        if (!planId || !key || !card) return;

        switchThreadGroup(card, planId, key);
    }

    function onContainerClick(ev) {
        if (!isTreeView()) return;
        var t = ev.target;


    }

    function onContainerInput(ev) {
        if (!isTreeView()) return;
        if (!ev.target.classList.contains('jms-tg-name')) return;
        var card = ev.target.closest('.jms-plan-card');
        if (card) syncTreeNameToLegacy(card);
    }

    function bindContainer(container) {
        if (!container || container.__jmsTgTreeBound) return;
        container.__jmsTgTreeBound = true;
        container.addEventListener('click', onNavDeleteClick, true);
        container.addEventListener('click', onNavClick, true);
        container.addEventListener('click', onContainerClick);
        container.addEventListener('input', onContainerInput);

        new MutationObserver(function (mutations) {
            if (!isTreeView() || navSwitching) return;
            var fromTreeHost = mutations.some(function (m) {
                var node = m.target;
                if (!node || !node.closest) return false;
                return !!node.closest('.jms-tg-tree-host');
            });
            if (fromTreeHost) return;
            scheduleSyncAll(true);
        }).observe(container, { childList: true, subtree: true });
    }



    function isStudioV2() {
        return !!(global.document.body && global.document.body.classList.contains('lth-studio-v2'));
    }

    function bootTreeView(container) {
        if (!container) return;
        try {
            global.sessionStorage.setItem(STORAGE_VIEW, 'tree');
        } catch (e) { /* ignore */ }
        global.document.body.classList.add('lth-tg-view-tree');
        bindContainer(container);
        if (global.JmsTgStepDrag && typeof global.JmsTgStepDrag.init === 'function') {
            global.JmsTgStepDrag.init();
        }
        var tries = 0;
        var waitModel = global.setInterval(function () {
            tries += 1;
            if (getModel() || tries > 80) {
                global.clearInterval(waitModel);
                syncAll(true);
            }
        }, 100);
    }

    function init() {
        if (!isJmeterTab()) return;
        var container = global.document.getElementById('jms-plans-container');
        if (!container) return;

        bootTreeView(container);
    }

    function initForStudioV2() {
        if (!isJmeterTab() || !isStudioV2()) return;
        bootTreeView(global.document.getElementById('jms-plans-container'));
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsTgTreeShell = {
        bootTreeView: bootTreeView,
        initForStudioV2: initForStudioV2,
        syncAll: syncAll,
        setTreeView: setTreeView,
        switchThreadGroup: switchThreadGroup,
        refreshHttpContext: refreshHttpContext,
        refreshTgDetailByTgId: refreshTgDetailByTgId
    };
}(typeof window !== 'undefined' ? window : this));
