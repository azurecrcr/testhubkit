/**
 * 线程组左侧导航：填满可用高度，内容超出时再滚动（隔离模块）
 */
(function (global) {
    'use strict';

    var syncTimer = null;
    var navObservers = new WeakMap();

    function debounce(fn, ms) {
        return function () {
            if (syncTimer) global.clearTimeout(syncTimer);
            var args = arguments;
            syncTimer = global.setTimeout(function () {
                syncTimer = null;
                fn.apply(null, args);
            }, ms);
        };
    }

    function isActiveContext() {
        var doc = global.document;
        return doc.body
            && doc.body.classList.contains('lth-tg-view-tree')
            && doc.body.classList.contains('lth-hub-jmeter-tab');
    }

    function syncNav(navEl) {
        if (!navEl || !isActiveContext()) return;
        var list = navEl.querySelector('.jms-tg-tree-nav__list');
        if (!list) return;

        if (global.matchMedia('(max-width: 960px)').matches) {
            list.style.maxHeight = '';
            list.style.overflowY = '';
            list.removeAttribute('data-jms-nav-scroll');
            return;
        }

        list.style.maxHeight = '';
        list.style.overflowY = '';

        global.requestAnimationFrame(function () {
            var needsScroll = list.scrollHeight > list.clientHeight + 1;
            if (needsScroll) {
                list.setAttribute('data-jms-nav-scroll', '1');
            } else {
                list.removeAttribute('data-jms-nav-scroll');
            }
        });
    }

    function observeNav(navEl) {
        if (!navEl || navObservers.has(navEl) || !global.ResizeObserver) return;
        var ro = new global.ResizeObserver(function () {
            syncNav(navEl);
        });
        ro.observe(navEl);
        var list = navEl.querySelector('.jms-tg-tree-nav__list');
        if (list) ro.observe(list);
        navObservers.set(navEl, ro);
    }

    function syncAll() {
        if (!isActiveContext()) return;
        global.document.querySelectorAll('.jms-tg-tree-nav').forEach(function (navEl) {
            observeNav(navEl);
            syncNav(navEl);
        });
    }

    var debouncedSync = debounce(syncAll, 100);

    function bind() {
        if (!global.document.body) return;
        global.addEventListener('resize', debouncedSync, { passive: true });
        global.addEventListener('orientationchange', debouncedSync, { passive: true });
        debouncedSync();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgNavViewport = {
        syncNav: syncNav,
        syncAll: syncAll
    };
}(typeof window !== 'undefined' ? window : this));
