/**
 * Studio v2 · 树形步骤展开/收起（取样器 + 逻辑控制器，隔离模块）
 */
(function (global) {
    'use strict';

    var LOGIC_CARD_SEL = '.jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card';

    function isActive() {
        return global.document.body.classList.contains('lth-studio-v2') &&
            global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function setToggleState(btn, expanded) {
        if (!btn) return;
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function findToggle(scope) {
        if (!scope) return null;
        return scope.querySelector('.jms-tree-step-toggle');
    }

    function toggleLogicCard(card) {
        var L = global.JmsLogicCtrlCardToggle;
        if (L && typeof L.toggleCard === 'function') {
            L.toggleCard(card);
            var collapsed = card.classList.contains('jms-if-card--collapsed') ||
                card.classList.contains('jms-random-card--collapsed') ||
                card.classList.contains('jms-simple-card--collapsed') ||
                card.classList.contains('jms-transaction-card--collapsed') ||
                card.classList.contains('jms-loop-card--collapsed');
            setToggleState(findToggle(card), !collapsed);
            return;
        }
        var body = card.querySelector('.jms-if-card__body, .jms-random-card__body, .jms-simple-card__body, .jms-transaction-card__body, .jms-loop-card__body');
        if (!body) return;
        var hide = body.style.display !== 'none';
        body.style.display = hide ? 'none' : '';
        card.classList.toggle('jms-if-card--collapsed', hide && card.classList.contains('jms-if-card'));
        card.classList.toggle('jms-random-card--collapsed', hide && card.classList.contains('jms-random-card'));
        card.classList.toggle('jms-simple-card--collapsed', hide && card.classList.contains('jms-simple-card'));
        card.classList.toggle('jms-transaction-card--collapsed', hide && card.classList.contains('jms-transaction-card'));
        card.classList.toggle('jms-loop-card--collapsed', hide && card.classList.contains('jms-loop-card'));
        setToggleState(findToggle(card), !hide);
    }

    function toggleHttpNode(node) {
        var collapsed = node.classList.toggle('jms-tree-node--collapsed');
        setToggleState(findToggle(node), !collapsed);
    }

    function toggleAuxCard(card) {
        var collapsed = card.classList.toggle('jms-aux-card--collapsed');
        setToggleState(findToggle(card), !collapsed);
    }

    function syncToggleButtons(root) {
        if (!root) return;
        root.querySelectorAll(LOGIC_CARD_SEL).forEach(function (card) {
            var collapsed = card.classList.contains('jms-if-card--collapsed') ||
                card.classList.contains('jms-random-card--collapsed') ||
                card.classList.contains('jms-simple-card--collapsed') ||
                card.classList.contains('jms-transaction-card--collapsed') ||
                card.classList.contains('jms-loop-card--collapsed');
            setToggleState(findToggle(card), !collapsed);
        });
        root.querySelectorAll('.jms-tree-node--http').forEach(function (node) {
            setToggleState(findToggle(node), !node.classList.contains('jms-tree-node--collapsed'));
        });
        root.querySelectorAll('.jms-aux-card').forEach(function (card) {
            setToggleState(findToggle(card), !card.classList.contains('jms-aux-card--collapsed'));
        });
    }

    function onClick(ev) {
        if (!isActive()) return;
        var btn = ev.target.closest('.jms-tree-step-toggle');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
        var logicCard = btn.closest(LOGIC_CARD_SEL);
        if (logicCard) {
            toggleLogicCard(logicCard);
            return;
        }
        var httpNode = btn.closest('.jms-tree-node--http');
        if (httpNode) {
            toggleHttpNode(httpNode);
            return;
        }
        var auxCard = btn.closest('.jms-aux-card');
        if (auxCard) {
            toggleAuxCard(auxCard);
        }
    }

    function bind() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgTreeStepToggleBound === '1') return;
        root.dataset.jmsTgTreeStepToggleBound = '1';
        root.addEventListener('click', onClick, true);
        syncToggleButtons(root);
        new MutationObserver(function () {
            syncToggleButtons(root);
        }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgTreeStepToggleUi = { syncAll: syncToggleButtons, bind: bind };
})(window);
