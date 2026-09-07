/**
 * JMeter 压测 · AI 悬浮面板拉伸（仅 lth-hub-jmeter-tab，与 doc_tools 完全隔离）
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'jms-ai-panel-size-v3';
    var MIN_WIDTH = 336;
    var MIN_HEIGHT = 384;
    var DEFAULT_WIDTH = 456;
    var DEFAULT_HEIGHT = 528;
    var MOBILE_MQ = '(max-width: 640px)';

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function isMobileLayout() {
        return global.matchMedia && global.matchMedia(MOBILE_MQ).matches;
    }

    function getPanel() {
        return global.document.getElementById('jms-ai-panel');
    }

    function getViewportLimits(panel) {
        var style = global.getComputedStyle(panel);
        if (panel.dataset.jmsAiPanelDragged === '1' || panel.classList.contains('jms-ai-panel--user-positioned')) {
            var leftPos = parseFloat(style.left) || 0;
            var topPos = parseFloat(style.top) || 0;
            return {
                maxW: Math.max(MIN_WIDTH, global.innerWidth - leftPos - 12),
                maxH: Math.max(MIN_HEIGHT, global.innerHeight - topPos - 12)
            };
        }
        if (panel.classList.contains('jms-ai-panel--dock-above')) {
            var left = parseFloat(style.left) || 0;
            var bottom = parseFloat(style.bottom) || 0;
            return {
                maxW: Math.max(MIN_WIDTH, global.innerWidth - left - 12),
                maxH: Math.max(MIN_HEIGHT, global.innerHeight - bottom - 12)
            };
        }
        var right = parseFloat(style.right) || 0;
        var bottomLegacy = parseFloat(style.bottom) || 0;
        return {
            maxW: Math.max(MIN_WIDTH, global.innerWidth - right - 12),
            maxH: Math.max(MIN_HEIGHT, global.innerHeight - bottomLegacy - 12)
        };
    }

    function applySize(panel, width, height) {
        if (isMobileLayout()) return;
        var limits = getViewportLimits(panel);
        var w = clamp(Math.round(width), MIN_WIDTH, limits.maxW);
        var h = clamp(Math.round(height), MIN_HEIGHT, limits.maxH);
        panel.style.width = w + 'px';
        panel.style.height = h + 'px';
        panel.dataset.jmsAiPanelSized = '1';
        if (global.JmsJmeterAiPanel && typeof global.JmsJmeterAiPanel.positionPanelAboveFab === 'function') {
            global.JmsJmeterAiPanel.positionPanelAboveFab();
        }
        try {
            global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ w: w, h: h }));
        } catch (e1) { /* ignore */ }
    }

    function clearCustomSize(panel) {
        panel.style.width = '';
        panel.style.height = '';
        delete panel.dataset.jmsAiPanelSized;
        try {
            global.sessionStorage.removeItem(STORAGE_KEY);
        } catch (e2) { /* ignore */ }
    }

    function restoreSize(panel) {
        if (isMobileLayout()) return;
        try {
            var raw = global.sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (data && data.w && data.h) applySize(panel, data.w, data.h);
        } catch (e3) { /* ignore */ }
    }

    function initDefaultSize(panel) {
        if (isMobileLayout() || panel.dataset.jmsAiPanelSized === '1') return;
        var limits = getViewportLimits(panel);
        var w = clamp(DEFAULT_WIDTH, MIN_WIDTH, limits.maxW);
        var h = clamp(Math.min(DEFAULT_HEIGHT, limits.maxH), MIN_HEIGHT, limits.maxH);
        panel.style.width = w + 'px';
        panel.style.height = h + 'px';
    }

    function setResizeCursor(mode) {
        var map = { n: 'ns-resize', w: 'ew-resize', e: 'ew-resize', nw: 'nwse-resize', ne: 'nesw-resize' };
        global.document.body.style.cursor = map[mode] || 'nwse-resize';
    }

    function startResize(panel, mode, pointerId, startX, startY) {
        if (isMobileLayout()) return;
        var startRect = panel.getBoundingClientRect();
        var startW = startRect.width;
        var startH = startRect.height;

        function onMove(e) {
            if (e.pointerId !== pointerId) return;
            e.preventDefault();
            var dx = startX - e.clientX;
            var dy = startY - e.clientY;
            var newW = startW;
            var newH = startH;
            var dxRight = e.clientX - startX;
            if (mode === 'nw' || mode === 'w') newW = startW + dx;
            if (mode === 'ne' || mode === 'e') newW = startW + dxRight;
            if (mode === 'nw' || mode === 'ne' || mode === 'n') newH = startH + dy;
            applySize(panel, newW, newH);
        }

        function endResize(e) {
            if (e.pointerId !== pointerId) return;
            global.document.removeEventListener('pointermove', onMove);
            global.document.removeEventListener('pointerup', endResize);
            global.document.removeEventListener('pointercancel', endResize);
            global.document.body.classList.remove('jms-ai-panel-resizing');
            global.document.body.style.cursor = '';
        }

        global.document.body.classList.add('jms-ai-panel-resizing');
        setResizeCursor(mode);
        global.document.addEventListener('pointermove', onMove);
        global.document.addEventListener('pointerup', endResize);
        global.document.addEventListener('pointercancel', endResize);
    }

    function bindHandle(panel, el) {
        var mode = el.getAttribute('data-resize') || 'nw';
        el.addEventListener('pointerdown', function (e) {
            if (isMobileLayout()) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof el.setPointerCapture === 'function') {
                try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            startResize(panel, mode, e.pointerId, e.clientX, e.clientY);
        });
    }

    function bindPanelResize(panel) {
        if (!panel || panel.dataset.jmsAiResizeBound === '1') return;
        panel.dataset.jmsAiResizeBound = '1';
        restoreSize(panel);
        initDefaultSize(panel);
        var handles = panel.querySelectorAll('.jms-ai-panel__resize');
        for (var i = 0; i < handles.length; i += 1) {
            bindHandle(panel, handles[i]);
        }
    }

    function initJmsAiPanelResize() {
        if (!isJmeterTab()) return;
        var panel = getPanel();
        if (!panel) return;
        bindPanelResize(panel);

        global.addEventListener('resize', function () {
            if (!isJmeterTab()) return;
            var p = getPanel();
            if (!p) return;
            if (isMobileLayout()) {
                clearCustomSize(p);
                return;
            }
            if (p.dataset.jmsAiPanelSized !== '1') initDefaultSize(p);
            else {
                var rect = p.getBoundingClientRect();
                applySize(p, rect.width, rect.height);
            }
            if (global.JmsJmeterAiPanel && typeof global.JmsJmeterAiPanel.positionPanelAboveFab === 'function') {
                global.JmsJmeterAiPanel.positionPanelAboveFab();
            }
        });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', initJmsAiPanelResize);
    } else {
        initJmsAiPanelResize();
    }

    global.JmsJmeterAiPanelResize = {
        init: initJmsAiPanelResize,
        applySize: applySize,
        restoreSize: restoreSize
    };
})(window);
