/**
 * JMeter · 取样器/逻辑控制器整卡点击展开/收缩（隔离模块，不修改原有 toggle 模块）
 */
(function (global) {
    'use strict';

    var LOGIC_CARD_SEL = '.jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card';
    var LOGIC_HEAD_SEL = '.jms-if-card__head, .jms-random-card__head, .jms-simple-card__head, .jms-transaction-card__head, .jms-loop-card__head';
    var CATALOG_CARD_SEL = '.jms-catalog-card--expandable';

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isBlocked(target) {
        if (!target || !target.closest) return true;
        return !!target.closest(
            'button, a, input, select, textarea, label, [role="menuitem"],' +
            ' .jms-tree-drag-handle, .jms-btn-edit-catalog, .jms-btn-del-catalog,' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-tg-tree-inline-actions, .jms-http-context, .jms-http-card,' +
            ' .jms-catalog-mount-context, .jms-catalog-mount-ctx-more, .jms-catalog-mount-ctx-btn,' +
            ' .jms-if-mount-context, .jms-if-mount-ctx-btn, .jms-if-mount-ctx-item, .jms-if-mount-ctx-menu,' +
            ' .jms-http-mount-children, .jms-tree-node--http-mount,' +
            ' .jms-if-mount-row-actions, .jms-if-mount-row-edit, .jms-if-mount-row-del, .jms-tree-node--if-mount',
            ' .jms-v2-catalog-popup, .jms-v2-catalog-popup__item'
        );
    }

    function stopClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    }

    function toggleCatalogCard(card) {
        var T = global.JmsCatalogCardToggle;
        if (T && typeof T.toggleCard === 'function') {
            T.toggleCard(card);
            return;
        }
        card.classList.toggle('jms-catalog-card--collapsed');
        card.setAttribute('aria-expanded', card.classList.contains('jms-catalog-card--collapsed') ? 'false' : 'true');
    }

    function toggleLogicCard(card) {
        var L = global.JmsLogicCtrlCardToggle;
        if (L && typeof L.toggleCard === 'function') {
            L.toggleCard(card);
            return;
        }
        var body = card.querySelector('.jms-if-card__body, .jms-random-card__body, .jms-simple-card__body, .jms-transaction-card__body, .jms-loop-card__body');
        if (!body) return;
        var hide = body.style.display !== 'none';
        body.style.display = hide ? 'none' : '';
    }

    function resolveCatalogCard(target) {
        if (isBlocked(target)) return null;
        var card = target.closest(CATALOG_CARD_SEL);
        return card || null;
    }

    function resolveLogicCard(target) {
        if (isBlocked(target)) return null;
        var card = target.closest(LOGIC_CARD_SEL);
        if (!card) return null;
        if (target.closest(LOGIC_HEAD_SEL)) return card;
        if (target.closest('.jms-if-card__body, .jms-random-card__body, .jms-simple-card__body, .jms-transaction-card__body, .jms-loop-card__body')) {
            return null;
        }
        if (target.closest('.jms-if-mount-context')) return null;
        return card;
    }

    function onClick(ev) {
        if (!isTreeView()) return;
        var t = ev.target;

        var catalogCard = resolveCatalogCard(t);
        if (catalogCard) {
            stopClick(ev);
            toggleCatalogCard(catalogCard);
            return;
        }

        var logicCard = resolveLogicCard(t);
        if (logicCard) {
            stopClick(ev);
            toggleLogicCard(logicCard);
        }
    }

    function bind() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsCatalogSamplerCtrlExpandBound === '1') return;
        root.dataset.jmsCatalogSamplerCtrlExpandBound = '1';
        root.addEventListener('click', onClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsCatalogSamplerCtrlExpandUi = { bind: bind };
})(window);
