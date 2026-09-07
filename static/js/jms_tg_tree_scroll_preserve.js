/**
 * 树形工作台 · 滚动位置保留（隔离模块，添加/刷新组件时不跳顶）
 */
(function (global) {
    'use strict';

    function pageY() {
        return global.scrollY || global.pageYOffset || 0;
    }

    function capture(card) {
        var snap = { winY: pageY() };
        if (!card) return snap;
        var steps = card.querySelector('.jms-tg-tree-steps');
        var navList = card.querySelector('.jms-tg-tree-nav__list');
        snap.stepsTop = steps ? steps.scrollTop : 0;
        snap.navListTop = navList ? navList.scrollTop : 0;
        return snap;
    }

    function restore(card, snap) {
        if (!snap) return;
        var winY = snap.winY || 0;
        var stepsTop = snap.stepsTop || 0;
        var navListTop = snap.navListTop || 0;
        global.requestAnimationFrame(function () {
            global.requestAnimationFrame(function () {
                if (card) {
                    var steps = card.querySelector('.jms-tg-tree-steps');
                    var navList = card.querySelector('.jms-tg-tree-nav__list');
                    if (steps) steps.scrollTop = stepsTop;
                    if (navList) navList.scrollTop = navListTop;
                }
                if (Math.abs(pageY() - winY) > 1) {
                    try {
                        global.scrollTo({ top: winY, left: 0, behavior: 'auto' });
                    } catch (e) {
                        global.scrollTo(0, winY);
                    }
                }
            });
        });
    }

    function captureAll() {
        var container = global.document.getElementById('jms-plans-container');
        var cards = Object.create(null);
        if (container) {
            container.querySelectorAll('.jms-plan-card').forEach(function (card) {
                var pid = card.getAttribute('data-plan-id');
                if (pid) cards[pid] = capture(card);
            });
        }
        return { winY: pageY(), cards: cards };
    }

    function restoreAll(snap) {
        if (!snap) return;
        var container = global.document.getElementById('jms-plans-container');
        global.requestAnimationFrame(function () {
            global.requestAnimationFrame(function () {
                if (container && snap.cards) {
                    Object.keys(snap.cards).forEach(function (pid) {
                        var card = container.querySelector('.jms-plan-card[data-plan-id="' + pid + '"]');
                        if (card) restore(card, snap.cards[pid]);
                    });
                }
                var winY = snap.winY || 0;
                if (Math.abs(pageY() - winY) > 1) {
                    try {
                        global.scrollTo({ top: winY, left: 0, behavior: 'auto' });
                    } catch (e) {
                        global.scrollTo(0, winY);
                    }
                }
            });
        });
    }

    global.JmsTgTreeScrollPreserve = {
        capture: capture,
        restore: restore,
        captureAll: captureAll,
        restoreAll: restoreAll
    };
}(typeof window !== 'undefined' ? window : this));
