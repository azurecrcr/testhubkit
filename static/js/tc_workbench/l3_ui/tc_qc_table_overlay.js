/**
 * TestHub — 质量检查表格蒙层（与用例生成蒙层、页面 loading 隔离）
 */
(function (global) {
    'use strict';

    var state = {
        visible: false,
        hooked: false
    };

    var QC_STAGE_LABELS = {
        structure: '格式 / 表头检查',
        required: '关键字段检查',
        llm: 'AI 对照检查'
    };

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
        var el = $('tc-qc-table-overlay');
        if (el) return el;

        el = document.createElement('div');
        el.id = 'tc-qc-table-overlay';
        el.className = 'tc-qc-table-overlay hidden';
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="tc-qc-table-overlay__backdrop" aria-hidden="true"></div>' +
            '<div class="tc-qc-table-overlay__content">' +
                '<div class="tc-qc-table-overlay__mark" aria-hidden="true">' +
                    '<span class="tc-qc-table-overlay__ring"></span>' +
                    '<span class="tc-qc-table-overlay__ring tc-qc-table-overlay__ring--delay"></span>' +
                    '<span class="tc-qc-table-overlay__core">' +
                        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
                            '<path d="M12 3.5l7 3.2v5.4c0 4.6-2.9 7.8-7 9.4-4.1-1.6-7-4.8-7-9.4V6.7l7-3.2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
                            '<path d="M8.8 12.1l2.1 2.1 4.5-4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '</svg>' +
                    '</span>' +
                '</div>' +
                '<p class="tc-qc-table-overlay__title">质量检查中</p>' +
                '<p class="tc-qc-table-overlay__stage">准备中…</p>' +
                '<p class="tc-qc-table-overlay__meta hidden"></p>' +
                '<div class="tc-qc-table-overlay__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
                    '<div class="tc-qc-table-overlay__progress-track">' +
                        '<div class="tc-qc-table-overlay__progress-fill"></div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        mount.appendChild(el);
        return el;
    }

    function setProgress(percent) {
        var el = $('tc-qc-table-overlay');
        if (!el) return;
        var rounded = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        var fill = el.querySelector('.tc-qc-table-overlay__progress-fill');
        var bar = el.querySelector('.tc-qc-table-overlay__progress');
        if (fill) fill.style.width = rounded + '%';
        if (bar) bar.setAttribute('aria-valuenow', String(rounded));
    }

    function update(opts) {
        opts = opts || {};
        var el = $('tc-qc-table-overlay');
        if (!el) return;
        var stageEl = el.querySelector('.tc-qc-table-overlay__stage');
        var metaEl = el.querySelector('.tc-qc-table-overlay__meta');
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
        el.classList.add('tc-qc-table-overlay--visible');
        el.setAttribute('aria-hidden', 'false');
        el.setAttribute('aria-busy', 'true');

        var mount = getMount();
        if (mount) mount.classList.add('tc-vxe-table-view-panel--qc-overlay');
    }

    function hide() {
        state.visible = false;
        var el = $('tc-qc-table-overlay');
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('tc-qc-table-overlay--visible');
        el.setAttribute('aria-hidden', 'true');
        el.removeAttribute('aria-busy');
        var mount = getMount();
        if (mount) mount.classList.remove('tc-vxe-table-view-panel--qc-overlay');
    }

    function isQualityOverlayContext(ui) {
        if (!state.visible) return false;
        if (ui && typeof ui.isQualityMode === 'function') return ui.isQualityMode();
        return true;
    }

    function wrapMethod(ui, name, handler) {
        var orig = ui[name];
        if (typeof orig !== 'function') return;
        ui[name] = function () {
            var args = arguments;
            try { handler.apply(null, args); } catch (e) { /* ignore overlay hook errors */ }
            return orig.apply(ui, args);
        };
    }

    function installQualityHooks() {
        if (state.hooked || !global.TcGenStageUi) return false;
        state.hooked = true;
        var ui = global.TcGenStageUi;

        wrapMethod(ui, 'showQualityCheck', function (opts) {
            opts = opts || {};
            show({
                stage: '准备中…',
                meta: opts.meta || '',
                percent: 0
            });
        });

        wrapMethod(ui, 'hideQualityCheck', function () { hide(); });
        wrapMethod(ui, 'completeQualityCheck', function () { hide(); });
        wrapMethod(ui, 'cancelQualityCheck', function () { hide(); });
        wrapMethod(ui, 'show', function () { hide(); });

        wrapMethod(ui, 'syncQualityStage', function (stepId, status, detail) {
            if (!state.visible) return;
            var active = status === 'active' || status === 'running';
            if (!active) return;
            var label = QC_STAGE_LABELS[stepId] || stepId || '检查中…';
            update({
                stage: detail ? (label + ' · ' + detail) : label,
                meta: detail || ''
            });
        });

        wrapMethod(ui, 'updateProgress', function (percent) {
            if (!isQualityOverlayContext(ui)) return;
            setProgress(percent);
        });

        wrapMethod(ui, 'updateMeta', function (_title, metaText) {
            if (!isQualityOverlayContext(ui)) return;
            if (metaText != null) update({ meta: metaText });
        });

        wrapMethod(ui, 'updateStageLabel', function (label) {
            if (!isQualityOverlayContext(ui)) return;
            if (label) update({ stage: label });
        });

        return true;
    }

    function tryInstallHooks() {
        if (installQualityHooks()) return;
        global.setTimeout(tryInstallHooks, 300);
    }

    global.TcQcTableOverlay = {
        show: show,
        hide: hide,
        update: update,
        isVisible: function () { return state.visible; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            global.setTimeout(tryInstallHooks, 240);
        });
    } else {
        global.setTimeout(tryInstallHooks, 240);
    }
})(typeof window !== 'undefined' ? window : this);
