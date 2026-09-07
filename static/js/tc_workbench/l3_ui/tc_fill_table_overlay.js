/**
 * TestHub — 用例补充表格蒙层（与质量检查/用例生成蒙层隔离）
 */
(function (global) {
    'use strict';

    var state = { visible: false };

    function $(id) { return document.getElementById(id); }

    function getMount() {
        return $('tc-vxe-table-view-panel') || $('tc-table-list-panel');
    }

    function isTableViewActive() {
        if (typeof global.tcRightViewMode === 'string') {
            return global.tcRightViewMode === 'table';
        }
        var panel = $('tc-vxe-table-view-panel');
        return !!(panel && !panel.classList.contains('hidden'));
    }

    function ensureOverlayDom() {
        var mount = getMount();
        if (!mount) return null;
        var el = $('tc-fill-table-overlay');
        if (el) return el;

        el = document.createElement('div');
        el.id = 'tc-fill-table-overlay';
        el.className = 'tc-fill-table-overlay hidden';
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class=tc-fill-table-overlay__backdrop aria-hidden=true></div>' +
            '<div class=tc-fill-table-overlay__content>' +
                '<div class=tc-fill-table-overlay__mark aria-hidden=true>' +
                    '<span class=tc-fill-table-overlay__ring></span>' +
                    '<span class=tc-fill-table-overlay__ring tc-fill-table-overlay__ring--delay></span>' +
                    '<span class=tc-fill-table-overlay__core>' +
                        '<svg viewBox=0 0 24 24 fill=none aria-hidden=true>' +
                            '<path d=M12 5v14M5 12h14 stroke=currentColor stroke-width=1.75 stroke-linecap=round/>' +
                            '<rect x=4.5 y=4.5 width=15 height=15 rx=4 stroke=currentColor stroke-width=1.35/>' +
                        '</svg>' +
                    '</span>' +
                '</div>' +
                '<p class=tc-fill-table-overlay__title>用例补充中</p>' +
                '<p class=tc-fill-table-overlay__stage>准备中…</p>' +
                '<p class=tc-fill-table-overlay__meta hidden></p>' +
                '<div class=tc-fill-table-overlay__progress role=progressbar aria-valuemin=0 aria-valuemax=100 aria-valuenow=0>' +
                    '<div class=tc-fill-table-overlay__progress-track>' +
                        '<div class=tc-fill-table-overlay__progress-fill></div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        mount.appendChild(el);
        return el;
    }

    function setProgress(percent) {
        var el = $('tc-fill-table-overlay');
        if (!el) return;
        var rounded = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        var fill = el.querySelector('.tc-fill-table-overlay__progress-fill');
        var bar = el.querySelector('.tc-fill-table-overlay__progress');
        if (fill) fill.style.width = rounded + '%';
        if (bar) bar.setAttribute('aria-valuenow', String(rounded));
    }

    function update(opts) {
        opts = opts || {};
        var el = $('tc-fill-table-overlay');
        if (!el) return;
        var stageEl = el.querySelector('.tc-fill-table-overlay__stage');
        var metaEl = el.querySelector('.tc-fill-table-overlay__meta');
        if (stageEl && opts.stage != null) stageEl.textContent = opts.stage;
        if (metaEl) {
            var meta = opts.meta != null ? String(opts.meta) : '';
            metaEl.textContent = meta;
            metaEl.classList.toggle('hidden', !meta);
        }
        if (opts.percent != null) setProgress(opts.percent);
    }

    function show(opts) {
        opts = opts || {};
        if (!isTableViewActive()) return;
        var el = ensureOverlayDom();
        if (!el) return;
        state.visible = true;
        update({
            stage: opts.stage || '准备中…',
            meta: opts.meta || '',
            percent: opts.percent != null ? opts.percent : 0
        });
        el.classList.remove('hidden');
        el.classList.add('tc-fill-table-overlay--visible');
        el.setAttribute('aria-hidden', 'false');
        el.setAttribute('aria-busy', 'true');
        var mount = getMount();
        if (mount) mount.classList.add('tc-vxe-table-view-panel--fill-overlay');
    }

    function hide() {
        state.visible = false;
        var el = $('tc-fill-table-overlay');
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('tc-fill-table-overlay--visible');
        el.setAttribute('aria-hidden', 'true');
        el.removeAttribute('aria-busy');
        var mount = getMount();
        if (mount) mount.classList.remove('tc-vxe-table-view-panel--fill-overlay');
    }

    global.TcFillTableOverlay = {
        show: show,
        hide: hide,
        update: update,
        isVisible: function () { return state.visible; }
    };
})(typeof window !== 'undefined' ? window : this);
