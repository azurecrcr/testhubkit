/**
 * JMeter 压测 · AI 悬浮面板拖拽移动（仅 lth-hub-jmeter-tab，与 doc_tools 完全隔离）
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'jms-ai-panel-pos-v1';
    var MOBILE_MQ = '(max-width: 640px)';
    var MARGIN = 12;

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isMobileLayout() {
        return global.matchMedia && global.matchMedia(MOBILE_MQ).matches;
    }

    function getPanel() {
        return global.document.getElementById('jms-ai-panel');
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function getDragHandle(panel) {
        return panel ? panel.querySelector('.jms-ai-panel__head') : null;
    }

    function isDragExcludedTarget(target) {
        if (!target || !target.closest) return true;
        return !!(target.closest('.jms-ai-panel__close') ||
            target.closest('.jms-ai-panel__resize') ||
            target.closest('button') ||
            target.closest('a'));
    }

    function applyPosition(panel, left, top, persist) {
        if (!panel || isMobileLayout()) return;
        var rect = panel.getBoundingClientRect();
        var w = rect.width || panel.offsetWidth;
        var h = rect.height || panel.offsetHeight;
        var maxLeft = Math.max(MARGIN, global.innerWidth - w - MARGIN);
        var maxTop = Math.max(MARGIN, global.innerHeight - h - MARGIN);
        var x = clamp(Math.round(left), MARGIN, maxLeft);
        var y = clamp(Math.round(top), MARGIN, maxTop);

        panel.style.position = 'fixed';
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.classList.remove('jms-ai-panel--dock-above');
        panel.classList.add('jms-ai-panel--user-positioned');
        panel.dataset.jmsAiPanelDragged = '1';

        if (persist !== false) {
            try {
                global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ left: x, top: y }));
            } catch (e1) { /* ignore */ }
        }
    }

    function clampPosition(panel) {
        if (!panel || panel.dataset.jmsAiPanelDragged !== '1') return;
        var style = global.getComputedStyle(panel);
        var left = parseFloat(style.left);
        var top = parseFloat(style.top);
        if (Number.isNaN(left) || Number.isNaN(top)) {
            var rect = panel.getBoundingClientRect();
            left = rect.left;
            top = rect.top;
        }
        applyPosition(panel, left, top, false);
    }

    function restorePosition(panel) {
        if (!panel || isMobileLayout()) return false;
        try {
            var raw = global.sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (!data || typeof data.left !== 'number' || typeof data.top !== 'number') return false;
            applyPosition(panel, data.left, data.top, false);
            return true;
        } catch (e2) {
            return false;
        }
    }

    function ensureTopLeftCoordinates(panel) {
        var style = global.getComputedStyle(panel);
        var left = parseFloat(style.left);
        var top = parseFloat(style.top);
        if (!Number.isNaN(left) && !Number.isNaN(top) && style.bottom === 'auto') {
            return { left: left, top: top };
        }
        var rect = panel.getBoundingClientRect();
        applyPosition(panel, rect.left, rect.top, false);
        return { left: rect.left, top: rect.top };
    }

    function startDrag(panel, handle, pointerId, startX, startY) {
        if (isMobileLayout()) return;

        var origin = ensureTopLeftCoordinates(panel);
        var startLeft = origin.left;
        var startTop = origin.top;

        function onMove(e) {
            if (e.pointerId !== pointerId) return;
            e.preventDefault();
            applyPosition(panel, startLeft + (e.clientX - startX), startTop + (e.clientY - startY), false);
        }

        function endDrag(e) {
            if (e.pointerId !== pointerId) return;
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', endDrag);
            handle.removeEventListener('pointercancel', endDrag);
            global.document.body.classList.remove('jms-ai-panel-dragging');
            handle.classList.remove('jms-ai-panel__head--dragging');
            clampPosition(panel);
            var style = global.getComputedStyle(panel);
            applyPosition(panel, parseFloat(style.left), parseFloat(style.top), true);
        }

        global.document.body.classList.add('jms-ai-panel-dragging');
        handle.classList.add('jms-ai-panel__head--dragging');
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', endDrag);
        handle.addEventListener('pointercancel', endDrag);
    }

    function bindDrag(panel) {
        if (!panel || panel.dataset.jmsAiDragBound === '1') return;
        var handle = getDragHandle(panel);
        if (!handle) return;
        panel.dataset.jmsAiDragBound = '1';

        handle.addEventListener('pointerdown', function (e) {
            if (isMobileLayout()) return;
            if (e.button !== 0) return;
            if (isDragExcludedTarget(e.target)) return;
            e.preventDefault();
            if (typeof handle.setPointerCapture === 'function') {
                try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            startDrag(panel, handle, e.pointerId, e.clientX, e.clientY);
        });
    }

    function initJmsAiPanelDrag() {
        if (!isJmeterTab()) return;
        var panel = getPanel();
        if (!panel) return;
        bindDrag(panel);

        global.addEventListener('resize', function () {
            if (!isJmeterTab()) return;
            var p = getPanel();
            if (!p || p.classList.contains('hidden')) return;
            if (p.dataset.jmsAiPanelDragged === '1') clampPosition(p);
        });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', initJmsAiPanelDrag);
    } else {
        initJmsAiPanelDrag();
    }

    global.JmsJmeterAiPanelDrag = {
        init: initJmsAiPanelDrag,
        restorePosition: restorePosition,
        clampPosition: clampPosition,
        isUserPositioned: function (panel) {
            panel = panel || getPanel();
            return !!(panel && panel.dataset.jmsAiPanelDragged === '1');
        }
    };
})(window);
