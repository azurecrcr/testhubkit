/**
 * JMeter Tab · 场景树首屏就绪标记（隔离）
 * 有内容后加上 lth-jms-studio-ready，解除 FOUC 阶段的空画布限高。
 */
(function (global) {
    'use strict';
    function markReady() {
        if (!document.body || !document.body.classList.contains('lth-hub-jmeter-tab')) return;
        document.body.classList.add('lth-jms-studio-ready');
    }
    function hasPlans() {
        var el = document.getElementById('jms-plans-container');
        return !!(el && el.children && el.children.length);
    }
    function watch() {
        if (!document.body || !document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (hasPlans()) {
            markReady();
            return;
        }
        var el = document.getElementById('jms-plans-container');
        if (!el || typeof MutationObserver === 'undefined') {
            global.addEventListener('load', function () {
                if (hasPlans()) markReady();
                else setTimeout(markReady, 0);
            });
            return;
        }
        var obs = new MutationObserver(function () {
            if (hasPlans()) {
                markReady();
                obs.disconnect();
            }
        });
        obs.observe(el, { childList: true });
        global.addEventListener('load', function () {
            if (hasPlans()) {
                markReady();
                obs.disconnect();
            }
        });
        // 兜底：3s 后仍标记，避免样式永久卡在 FOUC 限高
        setTimeout(function () {
            markReady();
            try { obs.disconnect(); } catch (e1) { /* ignore */ }
        }, 3000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watch);
    } else {
        watch();
    }
})(typeof window !== 'undefined' ? window : this);
