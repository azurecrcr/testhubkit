/**
 * 文档工具 · AI 悬浮面板拉伸（仅 doc-tools-page，与其他页面完全隔离）
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'cf-doc-ai-panel-size-v1';
    var MIN_WIDTH = 280;
    var MIN_HEIGHT = 300;
    var DEFAULT_WIDTH = 352;
    var DEFAULT_HEIGHT = 480;
    var MOBILE_MQ = '(max-width: 640px)';

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function isMobileLayout() {
        return window.matchMedia && window.matchMedia(MOBILE_MQ).matches;
    }

    function getViewportLimits(panel) {
        var style = window.getComputedStyle(panel);
        var right = parseFloat(style.right) || 0;
        var bottom = parseFloat(style.bottom) || 0;
        return {
            maxW: Math.max(MIN_WIDTH, window.innerWidth - right - 12),
            maxH: Math.max(MIN_HEIGHT, window.innerHeight - bottom - 12)
        };
    }

    function applySize(panel, width, height) {
        if (isMobileLayout()) return;
        var limits = getViewportLimits(panel);
        var w = clamp(Math.round(width), MIN_WIDTH, limits.maxW);
        var h = clamp(Math.round(height), MIN_HEIGHT, limits.maxH);
        panel.style.width = w + 'px';
        panel.style.height = h + 'px';
        panel.dataset.cfAiPanelSized = '1';
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ w: w, h: h }));
        } catch (e1) { /* ignore */ }
    }

    function clearCustomSize(panel) {
        panel.style.width = '';
        panel.style.height = '';
        delete panel.dataset.cfAiPanelSized;
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (e2) { /* ignore */ }
    }

    function restoreSize(panel) {
        if (isMobileLayout()) return;
        try {
            var raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (data && data.w && data.h) applySize(panel, data.w, data.h);
        } catch (e3) { /* ignore */ }
    }

    function initDefaultSize(panel) {
        if (isMobileLayout() || panel.dataset.cfAiPanelSized === '1') return;
        var limits = getViewportLimits(panel);
        var w = clamp(DEFAULT_WIDTH, MIN_WIDTH, limits.maxW);
        var h = clamp(Math.min(DEFAULT_HEIGHT, limits.maxH), MIN_HEIGHT, limits.maxH);
        panel.style.width = w + 'px';
        panel.style.height = h + 'px';
    }

    function setResizeCursor(mode) {
        var map = { n: 'ns-resize', w: 'ew-resize', nw: 'nwse-resize' };
        document.body.style.cursor = map[mode] || 'nwse-resize';
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
            if (mode === 'nw' || mode === 'w') newW = startW + dx;
            if (mode === 'nw' || mode === 'n') newH = startH + dy;
            applySize(panel, newW, newH);
        }

        function endResize(e) {
            if (e.pointerId !== pointerId) return;
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', endResize);
            document.removeEventListener('pointercancel', endResize);
            document.body.classList.remove('cf-doc-ai-panel-resizing');
            document.body.style.cursor = '';
        }

        document.body.classList.add('cf-doc-ai-panel-resizing');
        setResizeCursor(mode);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', endResize);
        document.addEventListener('pointercancel', endResize);
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

    function initDocToolsAiPanelResize() {
        if (!document.body.classList.contains('doc-tools-page')) return;
        var panel = document.getElementById('cf-doc-ai-panel');
        if (!panel) return;

        restoreSize(panel);
        initDefaultSize(panel);

        var handles = panel.querySelectorAll('.cf-doc-ai-panel__resize');
        for (var i = 0; i < handles.length; i += 1) {
            bindHandle(panel, handles[i]);
        }

        window.addEventListener('resize', function () {
            if (isMobileLayout()) {
                clearCustomSize(panel);
                return;
            }
            if (panel.dataset.cfAiPanelSized !== '1') return;
            var rect = panel.getBoundingClientRect();
            applySize(panel, rect.width, rect.height);
        });
    }

    document.addEventListener('DOMContentLoaded', initDocToolsAiPanelResize);
})();
