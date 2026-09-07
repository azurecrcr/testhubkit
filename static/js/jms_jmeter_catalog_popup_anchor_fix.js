/**
 * JMeter 压测 · Catalog 弹层滚动锚定（隔离模块）
 * 场景1：页面/步骤区滚动时保持弹层打开，并重新定位到触发按钮下方。
 */
(function (global) {
    'use strict';

    function getPopup() {
        return global.document.getElementById('jms-v2-catalog-popup');
    }

    function getAnchor(pop) {
        if (!pop) return null;
        if (pop.__jmsAnchorEl && pop.__jmsAnchorEl.isConnected) return pop.__jmsAnchorEl;
        return null;
    }

    function repositionOpenPopup() {
        var pop = getPopup();
        if (!pop) return false;
        var anchor = getAnchor(pop);
        if (!anchor) return false;
        var Menu = global.JmsCatalogMenuV2;
        if (Menu && typeof Menu.positionPopup === 'function') {
            Menu.positionPopup(anchor, pop);
            return true;
        }
        return false;
    }

    function bindPopup(pop, anchor) {
        if (!pop || !anchor) return;
        pop.__jmsAnchorEl = anchor;
        repositionOpenPopup();
    }

    function scheduleReposition() {
        if (!getPopup()) return;
        if (global.requestAnimationFrame) {
            global.requestAnimationFrame(repositionOpenPopup);
        } else {
            repositionOpenPopup();
        }
    }

    function init() {
        if (global.__jmsCatalogPopupAnchorFixBound) return;
        global.__jmsCatalogPopupAnchorFixBound = true;
        global.document.addEventListener('scroll', scheduleReposition, true);
        global.addEventListener('resize', scheduleReposition);
        global.document.addEventListener('wheel', scheduleReposition, { capture: true, passive: true });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsJmeterCatalogPopupAnchorFix = {
        bindPopup: bindPopup,
        repositionOpenPopup: repositionOpenPopup
    };
}(typeof window !== 'undefined' ? window : this));