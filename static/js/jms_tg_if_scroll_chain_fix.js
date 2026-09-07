/**
 * 树形视图 · If / 逻辑控制器挂载区滚轮链式传递（隔离模块）
 * 内层滚到底/顶后继续滚轮时，将剩余 delta 传给 .jms-tg-tree-steps 或外层页面。
 */
(function (global) {
    'use strict';

    var STEPS_SEL = '.jms-tg-tree-steps';
    var ZONE_SEL = '.jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card';
    var SKIP_SEL = 'textarea, select, input[type="number"], .jms-if-mount-ctx-menu, .lth-step-menu, .jms-step-modal, .jms-modal-open';

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isScrollableEl(el) {
        if (!el) return false;
        if (el === global.document.documentElement) {
            return global.document.documentElement.scrollHeight > global.innerHeight + 1;
        }
        if (el === global.document.body) return false;
        var style = global.getComputedStyle(el);
        var oy = style.overflowY;
        if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
        return el.scrollHeight > el.clientHeight + 1;
    }

    function canScrollEl(el, deltaY) {
        if (!isScrollableEl(el)) return false;
        if (deltaY < 0) return el.scrollTop > 0;
        if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        return false;
    }

    function collectScrollables(fromEl, boundaryEl) {
        var list = [];
        var node = fromEl;
        while (node && node !== boundaryEl) {
            if (isScrollableEl(node) && !node.matches(SKIP_SEL) && !node.closest(SKIP_SEL)) {
                list.push(node);
            }
            node = node.parentElement;
        }
        if (boundaryEl && isScrollableEl(boundaryEl)) {
            list.push(boundaryEl);
        }
        return list;
    }

    function scrollElBy(el, deltaY) {
        if (el === global.document.documentElement) {
            global.window.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
            return;
        }
        el.scrollTop += deltaY;
    }

    function findOuterScrollTarget(fromEl, deltaY) {
        var node = fromEl;
        while (node) {
            if (isScrollableEl(node) && canScrollEl(node, deltaY)) {
                return node;
            }
            node = node.parentElement;
        }
        var doc = global.document.documentElement;
        if (deltaY > 0 && global.window.scrollY + global.innerHeight < doc.scrollHeight - 1) {
            return doc;
        }
        if (deltaY < 0 && global.window.scrollY > 0) {
            return doc;
        }
        return null;
    }

    function onWheel(ev) {
        if (!isTreeView()) return;
        if (!ev.target || !ev.target.closest) return;
        if (ev.target.closest(SKIP_SEL)) return;

        var zone = ev.target.closest(ZONE_SEL);
        if (!zone) return;

        var deltaY = ev.deltaY;
        if (!deltaY) return;

        var stepsEl = zone.closest(STEPS_SEL);
        if (!stepsEl) return;

        var innerScrollables = collectScrollables(ev.target, stepsEl);
        var i;
        for (i = 0; i < innerScrollables.length; i++) {
            if (canScrollEl(innerScrollables[i], deltaY)) return;
        }

        if (canScrollEl(stepsEl, deltaY)) {
            ev.preventDefault();
            scrollElBy(stepsEl, deltaY);
            return;
        }

        var outerTarget = findOuterScrollTarget(stepsEl.parentElement, deltaY);
        if (!outerTarget) return;

        ev.preventDefault();
        scrollElBy(outerTarget, deltaY);
    }

    function init() {
        if (global.__jmsTgIfScrollChainBound) return;
        global.__jmsTgIfScrollChainBound = true;
        global.document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(typeof window !== 'undefined' ? window : this));
