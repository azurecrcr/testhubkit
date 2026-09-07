/**
 * HTTP 上下文 · catalog 薄垫片（替代已删除 jms_http_context_ui.js）
 * 树形视图仍引用的 API；工具条走 JmsCatalogMountContextUi + JmsCatalogMountMenuBridge
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'lth_http_context_selected';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function storageKey(planId, tgId) {
        return String(planId || '') + ':' + String(tgId || '');
    }

    function readMap() {
        try {
            var raw = global.sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function writeMap(map) {
        try {
            global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
        } catch (e) { /* ignore */ }
    }

    function getSelected(planId, tgId) {
        return readMap()[storageKey(planId, tgId)] || '';
    }

    function setSelected(planId, tgId, stepId) {
        var map = readMap();
        var key = storageKey(planId, tgId);
        if (!stepId) delete map[key];
        else map[key] = String(stepId);
        writeMap(map);
    }

    function clearSelected(planId, tgId) {
        setSelected(planId, tgId, '');
    }

    function clearPlan(planId) {
        var map = readMap();
        var prefix = String(planId || '') + ':';
        Object.keys(map).forEach(function (k) {
            if (k.indexOf(prefix) === 0) delete map[k];
        });
        writeMap(map);
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findHttpStep(model, planId, tgId, stepId) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.findMountHostStep === 'function') {
            return global.JmsMountHostResolver.findMountHostStep(model, planId, tgId, stepId);
        }
        return null;
    }

    function stepExistsInTg(model, planId, tgId, stepId) {
        return !!findHttpStep(model, planId, tgId, stepId);
    }

    function ensureHash(step) {
        var B = global.JmsMountCatalogBridge;
        if (B && typeof B.migrateLegacyMountArraysToHash === 'function') {
            B.migrateLegacyMountArraysToHash(step);
        }
        return step && Array.isArray(step.catalog_hash_children) ? step.catalog_hash_children : [];
    }

    function countHashCategory(step, cat) {
        return ensureHash(step).filter(function (c) {
            return c && c.type === 'catalog_element' && (c.category || 'other') === cat && c.enabled !== false;
        }).length;
    }

    function getAssertions(step) {
        var list = ensureHash(step).filter(function (c) {
            return c && c.type === 'catalog_element' && c.category === 'assertion';
        });
        if (list.length) return list;
        return Array.isArray(step && step.assertions) ? step.assertions.slice() : [];
    }

    function getAssertCount(step) {
        var n = countHashCategory(step, 'assertion');
        if (n) return n;
        var a = step && step.assertions;
        return Array.isArray(a) ? a.length : 0;
    }

    function getProcessorCount(step) {
        var n = countHashCategory(step, 'postprocessor');
        if (n) return n;
        var p = step && step.processors;
        return Array.isArray(p) ? p.length : 0;
    }

    function buildHttpRowMountBadgesHtml(step) {
        var parts = [];
        var assertCount = getAssertCount(step);
        if (assertCount) {
            parts.push('<span class="jms-http-assert-badge" title="已配置断言">' + assertCount + ' 条断言</span>');
        }
        var procCount = getProcessorCount(step);
        if (procCount) {
            parts.push('<span class="jms-http-proc-badge" title="已配置后置处理器">' + procCount + ' 个后置处理器</span>');
        }
        if (!parts.length) return '';
        return '<span class="jms-http-row-mount-badges">' + parts.join('') + '</span>';
    }

    function patchHttpRowMountBadges(node, step) {
        if (!node || !step) return;
        if (global.JmsTgTreeHeadBadgeSlots && typeof global.JmsTgTreeHeadBadgeSlots.patchHttpCardBadges === 'function') {
            global.JmsTgTreeHeadBadgeSlots.patchHttpCardBadges(node, step);
            return;
        }
        var main = node.querySelector('.jms-http-card__main, .jms-catalog-card__head');
        if (!main) return;
        var html = buildHttpRowMountBadgesHtml(step);
        var mountEl = main.querySelector('.jms-http-row-mount-badges');
        if (!html) {
            if (mountEl && mountEl.parentNode) mountEl.parentNode.removeChild(mountEl);
            return;
        }
        if (mountEl) {
            mountEl.outerHTML = html;
            return;
        }
        var wrap = global.document.createElement('div');
        wrap.innerHTML = html;
        var next = wrap.firstElementChild;
        if (next) main.appendChild(next);
    }

    function renderPanel(step, planId, tgId) {
        if (!step || !isTreeView()) return '';
        var M = global.JmsCatalogMountContextUi;
        if (M && typeof M.renderPanel === 'function') {
            return M.renderPanel(step, planId, tgId) || '';
        }
        return '';
    }

    function getStepsScrollEl(card) {
        if (!card) return null;
        var host = card.querySelector('.jms-tg-tree-host');
        if (host) {
            var inHost = host.querySelector('.jms-tg-tree-steps');
            if (inHost) return inHost;
        }
        return card.querySelector('.jms-tg-tree-main .jms-tg-tree-steps') ||
            card.querySelector('.jms-tg-tree-steps');
    }

    function findStepNode(stepsEl, stepId) {
        if (!stepsEl || !stepId) return null;
        var nodes = stepsEl.querySelectorAll('.jms-tree-node--http[data-step-id], .jms-tree-node--catalog[data-step-id]');
        for (var i = 0; i < nodes.length; i += 1) {
            if (String(nodes[i].getAttribute('data-step-id')) === String(stepId)) return nodes[i];
        }
        return null;
    }

    function expandStepCard(node) {
        if (!node) return;
        var httpCard = node.querySelector('.jms-http-card');
        if (httpCard) {
            node.classList.add('is-selected');
            httpCard.classList.remove('jms-http-card--collapsed');
            httpCard.setAttribute('aria-expanded', 'true');
            return;
        }
        var catCard = node.querySelector('.jms-catalog-card--expandable');
        if (catCard) {
            if (global.JmsCatalogCardToggle && typeof global.JmsCatalogCardToggle.toggleCard === 'function') {
                if (catCard.classList.contains('jms-catalog-card--collapsed')) {
                    global.JmsCatalogCardToggle.toggleCard(catCard);
                }
            } else {
                catCard.classList.remove('jms-catalog-card--collapsed');
                catCard.setAttribute('aria-expanded', 'true');
            }
        }
    }

    function collapseAllMountCards(stepsEl) {
        if (!stepsEl) return;
        stepsEl.querySelectorAll('.jms-tree-node--http.is-selected, .jms-tree-node--catalog.is-selected').forEach(function (node) {
            node.classList.remove('is-selected');
        });
        stepsEl.querySelectorAll('.jms-http-card').forEach(function (card) {
            card.classList.add('jms-http-card--collapsed');
            card.setAttribute('aria-expanded', 'false');
        });
        stepsEl.querySelectorAll('.jms-catalog-card--expandable').forEach(function (card) {
            if (global.JmsCatalogCardToggle && typeof global.JmsCatalogCardToggle.collapseCard === 'function') {
                global.JmsCatalogCardToggle.collapseCard(card);
            } else {
                card.classList.add('jms-catalog-card--collapsed');
                card.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function patchMountRows(card, planId, tgId, stepId) {
        if (!card || !stepId) return;
        if (global.JmsTgIfMountRefresh && typeof global.JmsTgIfMountRefresh.patchIfMountRowsInDom === 'function') {
            global.JmsTgIfMountRefresh.patchIfMountRowsInDom(planId, tgId, stepId);
        }
    }

    function patchSelectionInDom(card, planId, tgId, stepId) {
        if (!card) return false;
        var stepsEl = getStepsScrollEl(card);
        if (!stepsEl) return false;

        if (!stepId) {
            collapseAllMountCards(stepsEl);
            return true;
        }

        var node = findStepNode(stepsEl, stepId);
        var step = findHttpStep(getModel(), planId, tgId, stepId);
        if (!node || !step) return false;

        collapseAllMountCards(stepsEl);
        node.classList.add('is-selected');
        expandStepCard(node);
        patchHttpRowMountBadges(node, step);
        patchMountRows(card, planId, tgId, stepId);
        return true;
    }

    function resolvePlanCard(planId, fromEl) {
        if (planId) {
            var byId = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
            if (byId) return byId;
        }
        if (fromEl && fromEl.closest) {
            var card = fromEl.closest('.jms-plan-card');
            if (card) return card;
        }
        return global.document.querySelector('.jms-plan-card');
    }

    function deselectHttp(planId, tgId) {
        if (!planId || !tgId) return;
        clearSelected(planId, tgId);
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        if (card && patchSelectionInDom(card, planId, tgId, '')) return;
        if (card && global.JmsTgTreeShell && typeof global.JmsTgTreeShell.refreshHttpContext === 'function') {
            global.JmsTgTreeShell.refreshHttpContext(card, planId);
        }
    }

    function selectHttp(planId, tgId, stepId, fromEl) {
        if (!planId || !tgId || !stepId) return;
        setSelected(planId, tgId, stepId);
        var card = resolvePlanCard(planId, fromEl);
        if (card && patchSelectionInDom(card, planId, tgId, stepId)) return;
        if (card && global.JmsTgTreeShell && typeof global.JmsTgTreeShell.refreshHttpContext === 'function') {
            global.JmsTgTreeShell.refreshHttpContext(card, planId);
        }
    }

    function toggleHttpRowSelection(planId, tgId, stepId, fromEl) {
        if (!planId || !tgId || !stepId) return;
        var current = getSelected(planId, tgId);
        if (current && String(current) === String(stepId)) {
            deselectHttp(planId, tgId);
            return;
        }
        selectHttp(planId, tgId, stepId, fromEl);
    }

    function isSelectionBlocked(target) {
        if (!target || !target.closest) return true;
        return !!target.closest(
            'button, a, input, select, textarea, label, [role="menuitem"],' +
            ' .jms-tree-drag-handle, .jms-btn-edit-step, .jms-btn-edit-catalog, .jms-btn-del-catalog,' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-catalog-mount-context, .jms-if-mount-context, .jms-http-mount-children, .jms-tree-node--http-mount'
        );
    }

    function onRootClick(ev) {
        if (!isTreeView()) return;
        var t = ev.target;
        if (isSelectionBlocked(t)) return;
        var head = t.closest('.jms-http-card__head, .jms-catalog-card__head');
        if (!head) return;
        var card = head.closest('.jms-http-card, .jms-catalog-card--expandable');
        if (!card) return;
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        var stepId = card.getAttribute('data-step-id');
        if (!planId || !tgId || !stepId) return;
        ev.preventDefault();
        ev.stopPropagation();
        toggleHttpRowSelection(planId, tgId, stepId, card);
    }

    function bind() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsHttpContextShimBound === '1') return;
        root.dataset.jmsHttpContextShimBound = '1';
        root.addEventListener('click', onRootClick, true);
    }

    function ensureBind() {
        bind();
        if (global.JmsCatalogMountMenuBridge && typeof global.JmsCatalogMountMenuBridge.bind === 'function') {
            global.JmsCatalogMountMenuBridge.bind();
        }
        if (global.JmsCatalogCardToggle) { /* loaded */ }
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsHttpContextShimBound !== '1') {
            global.setTimeout(ensureBind, 50);
        }
    }

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', ensureBind);
        } else {
            ensureBind();
        }
    }

    global.JmsHttpContextUi = {
        getSelected: getSelected,
        setSelected: setSelected,
        clearSelected: clearSelected,
        clearPlan: clearPlan,
        stepExistsInTg: stepExistsInTg,
        findHttpStep: findHttpStep,
        getAssertions: getAssertions,
        getAssertCount: getAssertCount,
        getProcessorCount: getProcessorCount,
        buildHttpRowMountBadgesHtml: buildHttpRowMountBadgesHtml,
        patchHttpRowMountBadges: patchHttpRowMountBadges,
        renderPanel: renderPanel,
        patchSelectionInDom: patchSelectionInDom,
        selectHttp: selectHttp,
        deselectHttp: deselectHttp,
        toggleHttpRowSelection: toggleHttpRowSelection,
        bind: bind,
        ensureBind: ensureBind
    };
})(typeof window !== 'undefined' ? window : this);
