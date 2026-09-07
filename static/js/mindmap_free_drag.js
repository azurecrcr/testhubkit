/**
 * jsMind 节点自由拖动 — 测试用例页 / 用例转思维导图页共用
 * 将节点拖至画布任意位置，位置保存在 node.data.thFreeLeft / thFreeTop
 */
(function (global) {
    'use strict';

    var DATA_LEFT = 'thFreeLeft';
    var DATA_TOP = 'thFreeTop';
    var LINE_SVG_CLASS = 'th-mindmap-free-lines';
    var DIR_RIGHT = 1;
    var DIR_LEFT = -1;
    var SVG_NS = 'http://www.w3.org/2000/svg';

    function hasFreePos(node) {
        return !!(node && node.data && node.data[DATA_LEFT] != null && node.data[DATA_TOP] != null);
    }

    function anyFreePos(jm) {
        if (!jm || !jm.mind || !jm.mind.nodes) return false;
        var nodes = jm.mind.nodes;
        for (var id in nodes) {
            if (hasFreePos(nodes[id])) return true;
        }
        return false;
    }

    function clientToContent(view, clientX, clientY) {
        var panel = view.e_panel;
        var rect = panel.getBoundingClientRect();
        var z = view.zoom_current || 1;
        var offset = global.ThMindmapViewZoom
            ? global.ThMindmapViewZoom.getCenterOffset(view, z)
            : { x: 0, y: 0 };
        return {
            x: (clientX - rect.left + panel.scrollLeft - offset.x) / z,
            y: (clientY - rect.top + panel.scrollTop - offset.y) / z
        };
    }

    /** 读取节点在 jmnodes 本地坐标系中的位置（与 style.left/top 一致） */
    function getNodeBox(node) {
        var el = node._data && node._data.view && node._data.view.element;
        var v = node._data && node._data.view;
        if (!el || !v) return null;
        var l = parseFloat(el.style.left);
        if (isNaN(l)) l = v.abs_x || 0;
        var t = parseFloat(el.style.top);
        if (isNaN(t)) t = v.abs_y || 0;
        var w = el.offsetWidth || v.width || 0;
        var h = el.offsetHeight || v.height || 0;
        return { l: l, t: t, w: w, h: h, cx: l + w / 2, cy: t + h / 2 };
    }

    /** 按节点实际相对位置选择连接边（支持任意拖动方向） */
    function getVisualConnectionPoints(parent, child) {
        var pb = getNodeBox(parent);
        var cb = getNodeBox(child);
        if (!pb || !cb) return null;
        var dx = cb.cx - pb.cx;
        var dy = cb.cy - pb.cy;
        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx >= 0) {
                return {
                    out: { x: pb.l + pb.w, y: pb.cy },
                    in: { x: cb.l, y: cb.cy },
                    axis: 'h'
                };
            }
            return {
                out: { x: pb.l, y: pb.cy },
                in: { x: cb.l + cb.w, y: cb.cy },
                axis: 'h'
            };
        }
        if (dy >= 0) {
            return {
                out: { x: pb.cx, y: pb.t + pb.h },
                in: { x: cb.cx, y: cb.t },
                axis: 'v'
            };
        }
        return {
            out: { x: pb.cx, y: pb.t },
            in: { x: cb.cx, y: cb.t + cb.h },
            axis: 'v'
        };
    }

    /** 扩展画布尺寸以覆盖自由拖动后的节点，避免连线被裁切 */
    function ensureViewBounds(jm) {
        var view = jm.view;
        if (!view || !jm.mind) return;
        var pad = 80;
        var maxW = (view.size && view.size.w) || 0;
        var maxH = (view.size && view.size.h) || 0;
        var nodes = jm.mind.nodes;
        for (var id in nodes) {
            var node = nodes[id];
            var el = node._data && node._data.view && node._data.view.element;
            if (!el) continue;
            var r = (parseFloat(el.style.left) || 0) + (el.offsetWidth || 0) + pad;
            var b = (parseFloat(el.style.top) || 0) + (el.offsetHeight || 0) + pad;
            if (r > maxW) maxW = r;
            if (b > maxH) maxH = b;
        }
        if (maxW <= 0 || maxH <= 0) return;
        if (!view.size) view.size = { w: maxW, h: maxH };
        if (maxW > view.size.w || maxH > view.size.h) {
            view.size.w = maxW;
            view.size.h = maxH;
            if (view.graph && typeof view.graph.set_size === 'function') {
                view.graph.set_size(maxW, maxH);
            }
            if (view.e_nodes) {
                view.e_nodes.style.width = maxW + 'px';
                view.e_nodes.style.height = maxH + 'px';
            }
        }
    }

    function hideGraphCanvas(view, hidden) {
        if (!view || !view.graph) return;
        var canvas = view.graph.e_canvas;
        if (!canvas && typeof view.graph.element === 'function') {
            canvas = view.graph.element();
        }
        if (!canvas) return;
        if (hidden) {
            view.graph.clear();
            canvas.style.visibility = 'hidden';
            canvas.style.opacity = '0';
        } else {
            canvas.style.visibility = '';
            canvas.style.opacity = '';
        }
        canvas.style.pointerEvents = 'none';
    }

    function removeFreeLineSvg(view) {
        if (!view) return;
        var hosts = [];
        if (view.e_panel) hosts.push(view.e_panel);
        if (view.e_nodes) hosts.push(view.e_nodes);
        for (var h = 0; h < hosts.length; h++) {
            var svg = hosts[h].querySelector('svg.' + LINE_SVG_CLASS);
            if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
        }
    }

    /** SVG 放在 jmnodes 内，与节点共享同一 transform，避免缩放/居中后连线错位 */
    function ensureLineSvgLayer(view) {
        var host = view.e_nodes;
        if (!host) return null;
        var svg = host.querySelector('svg.' + LINE_SVG_CLASS);
        if (!svg) {
            svg = document.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('class', LINE_SVG_CLASS);
            svg.setAttribute('aria-hidden', 'true');
            svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:0;background:transparent;';
            host.insertBefore(svg, host.firstChild);
        }
        var w = (view.size && view.size.w) || host.offsetWidth || 800;
        var h = (view.size && view.size.h) || host.offsetHeight || 600;
        svg.setAttribute('width', String(w));
        svg.setAttribute('height', String(h));
        svg.style.width = w + 'px';
        svg.style.height = h + 'px';
        return svg;
    }

    function buildPathD(outPt, inPt, axis) {
        var outX = outPt.x;
        var outY = outPt.y;
        var inX = inPt.x;
        var inY = inPt.y;
        if (axis === 'v') {
            var midY = (outY + inY) / 2;
            return 'M ' + outX + ' ' + outY +
                ' C ' + outX + ' ' + midY + ', ' + inX + ' ' + midY + ', ' + inX + ' ' + inY;
        }
        var midX = (outX + inX) / 2;
        return 'M ' + outX + ' ' + outY +
            ' C ' + midX + ' ' + outY + ', ' + midX + ' ' + inY + ', ' + inX + ' ' + inY;
    }

    function cleanupOrphanCanvases(view) {
        if (!view || !view.e_panel) return;
        var list = view.e_panel.querySelectorAll('canvas:not(.jsmind)');
        for (var i = 0; i < list.length; i++) {
            list[i].style.display = 'none';
            list[i].style.pointerEvents = 'none';
        }
    }

    function repositionExpander(view, node) {
        var expander = node._data && node._data.view && node._data.view.expander;
        if (!expander || !node._data.view.element) return;
        var el = node._data.view.element;
        var dir = node._data.layout ? node._data.layout.direction : DIR_RIGHT;
        var lx = parseFloat(el.style.left) || 0;
        var ty = parseFloat(el.style.top) || 0;
        var w = el.offsetWidth || node._data.view.width || 0;
        var h = el.offsetHeight || node._data.view.height || 0;
        var ex = lx + (dir === DIR_LEFT ? -11 : w - 11);
        var ey = ty + (h - 11) / 2;
        expander.style.left = ex + 'px';
        expander.style.top = ey + 'px';
    }

    function redrawLinesFromDom(jm) {
        var view = jm.view;
        if (!view || !jm.mind) return;
        ensureViewBounds(jm);
        cleanupOrphanCanvases(view);
        if (view.graph) {
            view.graph.clear();
            hideGraphCanvas(view, true);
        }
        var svg = ensureLineSvgLayer(view);
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        var lineWidth = (view.opts && view.opts.line_width) || 2;
        var defaultColor = (view.opts && view.opts.line_color) || '#94a3b8';
        var nodes = jm.mind.nodes;
        for (var id in nodes) {
            var node = nodes[id];
            if (node.isroot || !view.layout.is_visible(node)) continue;
            var parent = node.parent;
            if (!parent) continue;
            var pts = getVisualConnectionPoints(parent, node);
            if (!pts) continue;
            var color = (node.data && node.data['leading-line-color']) || defaultColor;
            var path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', buildPathD(pts.out, pts.in, pts.axis));
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', String(lineWidth));
            path.setAttribute('stroke-linecap', 'round');
            svg.appendChild(path);
        }
    }

    function applyStoredFreePositions(jm) {
        var view = jm.view;
        if (!view || !jm.mind) return;
        var nodes = jm.mind.nodes;
        var hasAny = false;
        for (var id in nodes) {
            var node = nodes[id];
            if (!hasFreePos(node)) continue;
            var el = node._data && node._data.view && node._data.view.element;
            if (!el) continue;
            hasAny = true;
            var left = node.data[DATA_LEFT];
            var top = node.data[DATA_TOP];
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            node._data.view.abs_x = left;
            node._data.view.abs_y = top;
            repositionExpander(view, node);
        }
        if (hasAny) {
            redrawLinesFromDom(jm);
        }
    }

    function shouldUseCustomLines(jm) {
        return anyFreePos(jm);
    }

    function patchView(jm) {
        var view = jm.view;
        if (!view || view._thFreeDragPatched) return;
        view._thFreeDragPatched = true;
        var origShow = view._show.bind(view);
        view._show = function () {
            origShow();
            applyStoredFreePositions(jm);
            if (shouldUseCustomLines(jm)) {
                redrawLinesFromDom(jm);
            }
        };
        var origShowLines = view.show_lines.bind(view);
        view.show_lines = function () {
            if (!shouldUseCustomLines(jm)) {
                removeFreeLineSvg(view);
                hideGraphCanvas(view, false);
                origShowLines();
                return;
            }
            redrawLinesFromDom(jm);
        };
        cleanupOrphanCanvases(view);
    }

    function bind(jm, options) {
        options = options || {};
        var container = typeof options.container === 'string'
            ? document.getElementById(options.container)
            : options.container;
        if (!jm || !container) return;
        if (container._thFreeDragBound && container._thFreeDragJm === jm) return;
        container._thFreeDragBound = true;
        container._thFreeDragJm = jm;
        patchView(jm);

        var drag = null;
        var pending = null;
        var DRAG_THRESHOLD = 4;

        function finishDrag() {
            if (!drag) return;
            var node = drag.node;
            var el = drag.el;
            var moved = drag.moved;
            el.style.cursor = '';
            if (moved && node) {
                if (!node.data) node.data = {};
                node.data[DATA_LEFT] = parseFloat(el.style.left) || 0;
                node.data[DATA_TOP] = parseFloat(el.style.top) || 0;
                if (typeof options.onDragEnd === 'function') {
                    options.onDragEnd(node, moved);
                }
            }
            drag = null;
        }

        function clearPointerTracking() {
            document.removeEventListener('pointermove', onPointerMove, true);
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('pointercancel', onPointerUp, true);
        }

        function onPointerMove(e) {
            if (!drag && pending) {
                if (Math.abs(e.clientX - pending.startX) + Math.abs(e.clientY - pending.startY) <= DRAG_THRESHOLD) {
                    return;
                }
                drag = pending;
                pending = null;
                drag.moved = true;
                if (typeof options.onDragStart === 'function') {
                    options.onDragStart(drag.node);
                }
                drag.el.style.cursor = 'grabbing';
            }
            if (!drag) return;
            var view = jm.view;
            if (view && typeof view.is_editing === 'function' && view.is_editing()) return;
            var pos = clientToContent(view, e.clientX, e.clientY);
            var left = pos.x - drag.offX;
            var top = pos.y - drag.offY;
            drag.el.style.left = left + 'px';
            drag.el.style.top = top + 'px';
            drag.node._data.view.abs_x = left;
            drag.node._data.view.abs_y = top;
            repositionExpander(view, drag.node);
            redrawLinesFromDom(jm);
            e.preventDefault();
        }

        function onPointerUp() {
            clearPointerTracking();
            if (pending) {
                pending = null;
                return;
            }
            finishDrag();
        }

        container.addEventListener('pointerdown', function (e) {
            if (e.button != null && e.button !== 0) return;
            if (e.detail >= 2) return;
            if (options.isActive && !options.isActive()) return;
            var view = jm.view;
            if (!view) return;
            if (typeof view.is_editing === 'function' && view.is_editing()) return;
            var t = e.target;
            if (!t || !t.closest) return;
            if (t.closest('.jsmind-editor') || t.closest('input.jsmind-editor') ||
                t.closest('jmexpander') || t.closest('.jsmind-draggable-shadow-node')) return;
            if (options.shouldIgnoreTarget && options.shouldIgnoreTarget(t)) return;
            var nodeEl = t.closest('jmnode');
            if (!nodeEl || !container.contains(nodeEl)) return;
            var nodeId = nodeEl.getAttribute('nodeid');
            if (!nodeId) return;
            var node = jm.get_node(nodeId);
            if (!node) return;
            if (typeof options.canDragNode === 'function' && options.canDragNode(node) === false) return;

            var pos = clientToContent(view, e.clientX, e.clientY);
            var left = parseFloat(nodeEl.style.left) || 0;
            var top = parseFloat(nodeEl.style.top) || 0;

            pending = {
                node: node,
                el: nodeEl,
                offX: pos.x - left,
                offY: pos.y - top,
                startX: e.clientX,
                startY: e.clientY,
                moved: false
            };

            clearPointerTracking();
            document.addEventListener('pointermove', onPointerMove, true);
            document.addEventListener('pointerup', onPointerUp, true);
            document.addEventListener('pointercancel', onPointerUp, true);
        }, true);
    }

    global.ThMindmapFreeDrag = {
        DATA_LEFT: DATA_LEFT,
        DATA_TOP: DATA_TOP,
        hasFreePos: hasFreePos,
        anyFreePos: anyFreePos,
        applyStoredFreePositions: applyStoredFreePositions,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
