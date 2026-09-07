/**
 * jsMind 画布缩放 — 测试用例页 / 用例转思维导图页共用
 * 使用 transform: scale()，避免 style.zoom 在部分浏览器/custom element 上无效
 */
(function (global) {
    'use strict';

    var SCROLL_SPACER_CLASS = 'th-mindmap-zoom-scroll-spacer';

    function getZoomLimits(view) {
        var zoomOpts = (view && view.opts && view.opts.zoom) || (view && view.options && view.options.zoom) || {};
        return {
            min: zoomOpts.min != null ? zoomOpts.min : 0.08,
            max: zoomOpts.max != null ? zoomOpts.max : 4
        };
    }

    function normalizeWheelDelta(e) {
        var dy = e.deltaY || 0;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= (global.innerHeight || 800);
        return dy;
    }

    function wheelZoomScale(deltaY) {
        return Math.exp(-deltaY * 0.002);
    }

    function getContentSize(view) {
        if (!view) return { w: 1, h: 1 };
        var hm = (view.opts && view.opts.hmargin != null ? view.opts.hmargin : 80) * 2;
        var vm = (view.opts && view.opts.vmargin != null ? view.opts.vmargin : 40) * 2;
        if (view.layout && typeof view.layout.get_min_size === 'function') {
            try {
                var ms = view.layout.get_min_size();
                if (ms && ms.w > 0 && ms.h > 0) {
                    return { w: ms.w + hm, h: ms.h + vm };
                }
            } catch (e1) { /* ignore */ }
        }
        if (view.e_nodes) {
            var ew = view.e_nodes.offsetWidth;
            var eh = view.e_nodes.offsetHeight;
            if (ew > 0 && eh > 0) return { w: ew, h: eh };
        }
        var size = view.size || { w: 0, h: 0 };
        if (size.w > 0 && size.h > 0) return { w: size.w, h: size.h };
        return { w: Math.max(size.w || 0, 240), h: Math.max(size.h || 0, 160) };
    }

    function getViewportSize(view) {
        if (!view || !view.e_panel) return { w: 1, h: 1 };
        var panel = view.e_panel;
        var rect = panel.getBoundingClientRect();
        return {
            w: rect.width || panel.clientWidth || 1,
            h: rect.height || panel.clientHeight || 1
        };
    }

    /** 内容小于视口时，用 translate 偏移实现居中（scroll 无法为负） */
    function getCenterOffset(view, z) {
        var vp = getViewportSize(view);
        var cs = getContentSize(view);
        var scaledW = cs.w * z;
        var scaledH = cs.h * z;
        return {
            x: scaledW < vp.w ? (vp.w - scaledW) / 2 : 0,
            y: scaledH < vp.h ? (vp.h - scaledH) / 2 : 0
        };
    }

    function centerPanelScroll(view, contentSize) {
        if (!view || !view.e_panel) return;
        var panel = view.e_panel;
        var vp = getViewportSize(view);
        var z = view.zoom_current || 1;
        var cs = contentSize || getContentSize(view);
        var offset = getCenterOffset(view, z);
        if (offset.x > 0 || offset.y > 0) {
            panel.scrollLeft = 0;
            panel.scrollTop = 0;
            return;
        }
        panel.scrollLeft = Math.max(0, (cs.w * z - vp.w) / 2);
        panel.scrollTop = Math.max(0, (cs.h * z - vp.h) / 2);
    }

    function paintElementZoom(el, z, offsetX, offsetY) {
        if (!el) return;
        el.style.removeProperty('zoom');
        offsetX = offsetX || 0;
        offsetY = offsetY || 0;
        if (Math.abs(z - 1) < 0.0001 && !offsetX && !offsetY) {
            el.style.removeProperty('transform');
            el.style.removeProperty('transform-origin');
            return;
        }
        el.style.transformOrigin = '0 0';
        var parts = [];
        if (offsetX || offsetY) {
            parts.push('translate(' + offsetX + 'px,' + offsetY + 'px)');
        }
        if (Math.abs(z - 1) >= 0.0001) {
            parts.push('scale(' + z + ')');
        }
        el.style.setProperty('transform', parts.join(' '), 'important');
    }

    function updateZoomScrollSpacer(view, z) {
        var panel = view && view.e_panel;
        if (!panel) return;
        var spacer = panel.querySelector('.' + SCROLL_SPACER_CLASS);
        if (!spacer) {
            spacer = document.createElement('div');
            spacer.className = SCROLL_SPACER_CLASS;
            spacer.setAttribute('aria-hidden', 'true');
            spacer.style.cssText = 'position:relative;pointer-events:none;visibility:hidden;';
            panel.appendChild(spacer);
        }
        var offset = getCenterOffset(view, z);
        if (offset.x > 0 || offset.y > 0) {
            spacer.style.width = '0';
            spacer.style.height = '0';
            return;
        }
        var cs = view.size || { w: 800, h: 600 };
        var hm = (view.opts && view.opts.hmargin != null ? view.opts.hmargin : 80) * 2;
        var vm = (view.opts && view.opts.vmargin != null ? view.opts.vmargin : 40) * 2;
        if (Math.abs(z - 1) < 0.0001) {
            spacer.style.width = '0';
            spacer.style.height = '0';
            return;
        }
        spacer.style.width = Math.ceil((cs.w || 800) * z + hm) + 'px';
        spacer.style.height = Math.ceil((cs.h || 600) * z + vm) + 'px';
    }

    function paintViewZoom(view, z, stageCanvasEl) {
        if (!view || !view.e_panel) return;
        var panel = view.e_panel;
        var offset = getCenterOffset(view, z);
        var i;
        for (i = 0; i < panel.children.length; i++) {
            var el = panel.children[i];
            if (el.classList && el.classList.contains(SCROLL_SPACER_CLASS)) continue;
            paintElementZoom(el, z, offset.x, offset.y);
        }
        syncGridCanvasSize(stageCanvasEl, view);
        updateZoomScrollSpacer(view, z);
    }

    function syncGridCanvasSize(canvasEl, view) {
        if (!canvasEl || !view) return;
        var panel = view.e_panel;
        if (panel && !panel.contains(canvasEl)) {
            canvasEl.style.width = '100%';
            canvasEl.style.height = '100%';
            canvasEl.style.minWidth = '0';
            canvasEl.style.minHeight = '0';
            canvasEl.style.removeProperty('transform');
            canvasEl.style.removeProperty('transform-origin');
            return;
        }
        var size = view.size || { w: 0, h: 0 };
        var z = view.zoom_current || 1;
        var offset = getCenterOffset(view, z);
        canvasEl.style.width = Math.max(size.w || 0, 2400) + 'px';
        canvasEl.style.height = Math.max(size.h || 0, 1600) + 'px';
        paintElementZoom(canvasEl, z, offset.x, offset.y);
    }

    function centerView(jm, stageCanvasEl) {
        if (!jm || !jm.view) return false;
        var view = jm.view;
        centerPanelScroll(view);
        paintViewZoom(view, view.zoom_current || 1, stageCanvasEl);
        return true;
    }

    function applyZoom(view, zoom, clientX, clientY, stageCanvasEl) {
        if (!view || !view.e_panel) return false;
        var limits = getZoomLimits(view);
        var next = zoom;
        if (next < limits.min) next = limits.min;
        if (next > limits.max) next = limits.max;
        var panel = view.e_panel;
        var vp = getViewportSize(view);
        var anchorX = clientX != null ? clientX : (panel.getBoundingClientRect().left + vp.w / 2);
        var anchorY = clientY != null ? clientY : (panel.getBoundingClientRect().top + vp.h / 2);
        var rect = panel.getBoundingClientRect();
        var nx = anchorX - rect.left;
        var ny = anchorY - rect.top;
        var oldZ = view.zoom_current || 1;
        if (Math.abs(next - oldZ) < 0.0001) {
            paintViewZoom(view, next, stageCanvasEl);
            return true;
        }
        var oldOffset = getCenterOffset(view, oldZ);
        var scrollLeft = panel.scrollLeft;
        var scrollTop = panel.scrollTop;
        if (!oldOffset.x && !oldOffset.y) {
            scrollLeft = (panel.scrollLeft + nx) * next / oldZ - nx;
            scrollTop = (panel.scrollTop + ny) * next / oldZ - ny;
        }
        view.zoom_current = next;
        if (typeof view._show === 'function') {
            try { view._show(); } catch (err) { /* ignore */ }
        }
        var newOffset = getCenterOffset(view, next);
        if (newOffset.x > 0 || newOffset.y > 0) {
            panel.scrollLeft = 0;
            panel.scrollTop = 0;
        } else {
            panel.scrollLeft = Math.max(0, scrollLeft);
            panel.scrollTop = Math.max(0, scrollTop);
        }
        paintViewZoom(view, next, stageCanvasEl);
        return true;
    }

    function zoomByStep(view, step, clientX, clientY, stageCanvasEl) {
        if (!view) return false;
        var limits = getZoomLimits(view);
        var next = (view.zoom_current || 1) + step;
        if (next < limits.min) next = limits.min;
        if (next > limits.max) next = limits.max;
        return applyZoom(view, next, clientX, clientY, stageCanvasEl);
    }

    function fitToView(jm, options) {
        options = options || {};
        var stageCanvasEl = options.stageCanvasEl || null;
        var onAfter = options.onAfter || null;
        var pad = options.pad != null ? options.pad : 40;
        if (!jm || !jm.view || !jm.mind || !jm.mind.root) return false;
        var view = jm.view;
        if (typeof view.expand_size === 'function') {
            try { view.expand_size(); } catch (e) { /* ignore */ }
        }
        if (typeof jm.resize === 'function') {
            try { jm.resize(); } catch (e2) { /* ignore */ }
        }
        var vp = getViewportSize(view);
        if (!vp.w || !vp.h) return false;
        var content = getContentSize(view);
        var fitZoom = Math.min((vp.w - pad) / content.w, (vp.h - pad) / content.h);
        var limits = getZoomLimits(view);
        if (fitZoom > limits.max) fitZoom = limits.max;
        if (fitZoom < limits.min) fitZoom = limits.min;
        var rect = view.e_panel.getBoundingClientRect();
        applyZoom(view, fitZoom, rect.left + vp.w / 2, rect.top + vp.h / 2, stageCanvasEl);
        global.requestAnimationFrame(function () {
            centerView(jm, stageCanvasEl);
            if (typeof onAfter === 'function') onAfter();
        });
        return true;
    }

    global.ThMindmapViewZoom = {
        SCROLL_SPACER_CLASS: SCROLL_SPACER_CLASS,
        getZoomLimits: getZoomLimits,
        normalizeWheelDelta: normalizeWheelDelta,
        wheelZoomScale: wheelZoomScale,
        getContentSize: getContentSize,
        getViewportSize: getViewportSize,
        getCenterOffset: getCenterOffset,
        centerPanelScroll: centerPanelScroll,
        centerView: centerView,
        paintElementZoom: paintElementZoom,
        paintViewZoom: paintViewZoom,
        syncGridCanvasSize: syncGridCanvasSize,
        applyZoom: applyZoom,
        zoomByStep: zoomByStep,
        fitToView: fitToView
    };
}(typeof window !== 'undefined' ? window : this));
