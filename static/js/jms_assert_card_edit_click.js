/**
 * 断言元件 · 树形卡片点击打开编辑弹窗（隔离模块）
 * 配合 jms_tg_tree_card_click_guard 使用，不影响其它 aux-card 行为。
 */
(function (global) {
    'use strict';

    function uiForKind(kind) {
        if (kind === 'response_assert') return global.JmsTgResponseAssertionUi;
        if (kind === 'json_assert') return global.JmsTgJsonAssertionUi;
        if (kind === 'size_assert') return global.JmsTgSizeAssertionUi;
        if (kind === 'md5hex_assert') return global.JmsTgMd5hexAssertionUi;
        return null;
    }

    function httpUiForKind(kind) {
        if (kind === 'response_assert') return global.JmsHttpResponseAssertionUi;
        if (kind === 'json_assert') return global.JmsHttpJsonAssertionUi;
        if (kind === 'size_assert') return global.JmsHttpSizeAssertionUi;
        if (kind === 'md5hex_assert') return global.JmsHttpMd5hexAssertionUi;
        return null;
    }

    function kindFromTgCard(card) {
        if (card.classList.contains('jms-aux-card--tg-assert-ra')) return 'response_assert';
        if (card.classList.contains('jms-aux-card--tg-assert-ja')) return 'json_assert';
        if (card.classList.contains('jms-aux-card--tg-assert-sa')) return 'size_assert';
        if (card.classList.contains('jms-aux-card--tg-assert-m5')) return 'md5hex_assert';
        return '';
    }

    function kindFromHttpMountCard(card) {
        var edit = card.querySelector('.jms-http-ctx-edit-assert[data-assert-kind]');
        return edit ? edit.getAttribute('data-assert-kind') || '' : '';
    }

    function openForCard(card) {
        if (!card) return false;
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        if (!planId || !tgId) return false;

        if (card.classList.contains('jms-aux-card--tg-assert')) {
            var idx = parseInt(card.getAttribute('data-tg-assert-index'), 10);
            var kind = kindFromTgCard(card);
            var ui = uiForKind(kind);
            if (!ui || typeof ui.openEdit !== 'function' || isNaN(idx)) return false;
            ui.openEdit(planId, tgId, idx);
            return true;
        }

        if (card.classList.contains('jms-aux-card--http-mount-assert')) {
            var stepId = card.getAttribute('data-step-id');
            var aIdx = parseInt(card.getAttribute('data-http-mount-assert-index') ||
                card.getAttribute('data-assert-index'), 10);
            var hKind = kindFromHttpMountCard(card);
            var hUi = httpUiForKind(hKind);
            if (!hUi || typeof hUi.openEdit !== 'function' || !stepId || isNaN(aIdx)) return false;
            hUi.openEdit(planId, tgId, stepId, aIdx);
            return true;
        }

        return false;
    }

    global.JmsAssertCardEditClick = { openForCard: openForCard };
}(typeof window !== 'undefined' ? window : this));
