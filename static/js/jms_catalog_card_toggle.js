/**
 * JMeter catalog · 卡片展开/收缩（所有 catalog 卡片，对齐逻辑控制器 / HTTP 行）
 */
(function (global) {
    'use strict';

    var collapsed = Object.create(null);
    var CARD_SEL = '.jms-catalog-card';
    var HEAD_SEL = '.jms-catalog-card__head';

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isExpandableCard(card) {
        return !!(card && card.classList.contains('jms-catalog-card--expandable'));
    }

    function isCardCollapsed(stepId) {
        if (Object.prototype.hasOwnProperty.call(collapsed, stepId)) return !!collapsed[stepId];
        return isTreeView();
    }

    function applyCollapseClass(card, isCollapsed) {
        if (!isExpandableCard(card)) return;
        card.classList.toggle('jms-catalog-card--collapsed', isCollapsed);
        card.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }


    function collapseDescendants(card) {
        if (!card) return;
        var body = card.querySelector(':scope > .jms-catalog-card__body');
        if (!body) return;
        body.querySelectorAll('.jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card').forEach(function (logic) {
            var L = global.JmsLogicCtrlCardToggle;
            if (L && typeof L.collapseCard === 'function') {
                L.collapseCard(logic);
            }
        });
        body.querySelectorAll('.jms-catalog-card--expandable').forEach(function (cat) {
            if (cat === card) return;
            var csid = cat.getAttribute('data-step-id');
            if (!csid) return;
            collapsed[csid] = true;
            applyCollapseClass(cat, true);
            collapseDescendants(cat);
        });

    }

    function applyState(planCard) {
        if (!planCard) return;
        planCard.querySelectorAll(CARD_SEL + '.jms-catalog-card--expandable').forEach(function (card) {
            var stepId = card.getAttribute('data-step-id');
            if (!stepId) return;
            applyCollapseClass(card, isCardCollapsed(stepId));
        });
    }

    function toggleCard(card) {
        if (!isExpandableCard(card)) return;
        var stepId = card.getAttribute('data-step-id');
        if (!stepId) return;
        collapsed[stepId] = !isCardCollapsed(stepId);
        applyCollapseClass(card, !!collapsed[stepId]);
        if (collapsed[stepId]) collapseDescendants(card);
    }

    function isSelectionBlocked(target) {
        if (!target || !target.closest) return true;
        return !!target.closest(
            'button, a, input, select, textarea, label, [role="menuitem"],' +
            ' .jms-tree-drag-handle, .jms-btn-edit-catalog, .jms-btn-del-catalog,' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-http-context, .jms-http-card, .jms-http-mount-children, .jms-tree-node--http-mount'
        );
    }

    function resolveCardFromClick(target) {
        if (!target || !target.closest || isSelectionBlocked(target)) return null;
        var head = target.closest(HEAD_SEL);
        if (!head) return null;
        var card = head.closest(CARD_SEL);
        return isExpandableCard(card) ? card : null;
    }

    function stopPassiveClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
    }

    function onRootClick(ev) {
        if (global.JmsCatalogSamplerCtrlExpandUi) return;
        if (!isTreeView()) return;
        var card = resolveCardFromClick(ev.target);
        if (!card) return;
        stopPassiveClick(ev);
        ev.stopPropagation();
        toggleCard(card);
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsCatalogCardToggleBound === '1') return;
        global.document.body.dataset.jmsCatalogCardToggleBound = '1';
        global.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    function collapseCard(card) {
        if (!isExpandableCard(card)) return;
        var stepId = card.getAttribute('data-step-id');
        if (!stepId) return;
        collapsed[stepId] = true;
        applyCollapseClass(card, true);
        collapseDescendants(card);
    }

    global.JmsCatalogCardToggle = {
        applyState: applyState,
        toggleCard: toggleCard,
        collapseCard: collapseCard,
        isCardCollapsed: isCardCollapsed
    };
})(window);
