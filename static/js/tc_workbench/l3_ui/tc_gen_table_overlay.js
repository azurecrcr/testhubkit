/**
 * TestHub — 用例生成表格蒙层（与页面切换 loading 隔离）
 */
(function (global) {
    'use strict';

    var state = {
        visible: false,
        outputTarget: 'list',
        stageHooked: false,
        tablePeek: false,
        writeTableStarted: false
    };

    var PIPELINE_STEP_LABELS = {
        lanhu: '获取蓝湖需求',
        parse_req: '解析与检索需求',
        generate: 'AI 生成用例',
        parse_rows: '解析并写入表格',
        split_modules: '模块拆分',
        generate_modules: '分模块生成用例',
        dedupe: '交叉去重'
    };

    var STREAM_STEP_LABELS = {
        connect: '连接模型',
        gen: '生成用例',
        parse: '解析结果',
        write: '写入表格'
    };

    function $(id) { return document.getElementById(id); }

    function getMount() {
        return $('tc-vxe-table-view-panel') || $('tc-table-list-panel');
    }

    function ensureOverlayDom() {
        var mount = getMount();
        if (!mount) return null;
        var el = $('tc-gen-table-overlay');
        if (el) return el;

        el = document.createElement('div');
        el.id = 'tc-gen-table-overlay';
        el.className = 'tc-gen-table-overlay hidden';
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="tc-gen-table-overlay__backdrop" aria-hidden="true"></div>' +
            '<div class="tc-gen-table-overlay__table-shield" aria-hidden="true"></div>' +
            '<div class="tc-gen-table-overlay__content">' +
                '<div class="tc-gen-table-overlay__mark" aria-hidden="true">' +
                    '<span class="tc-gen-table-overlay__ring"></span>' +
                    '<span class="tc-gen-table-overlay__ring tc-gen-table-overlay__ring--delay"></span>' +
                    '<span class="tc-gen-table-overlay__core">' +
                        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
                            '<path d="M12 3l1.2 4.2L17.5 8 13.2 9.2 12 13.5 10.8 9.2 6.5 8l4.3-.8L12 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
                            '<path d="M5 16.5l.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1-3.1-.9 3.1-.9.9-3.1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" opacity="0.85"/>' +
                        '</svg>' +
                    '</span>' +
                '</div>' +
                '<p class="tc-gen-table-overlay__title">AI 正在生成用例</p>' +
                '<p class="tc-gen-table-overlay__stage">准备中…</p>' +
                '<p class="tc-gen-table-overlay__meta hidden"></p>' +
                '<div class="tc-gen-table-overlay__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
                    '<div class="tc-gen-table-overlay__progress-track">' +
                        '<div class="tc-gen-table-overlay__progress-fill"></div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        mount.appendChild(el);
        return el;
    }

    function isListTarget(target) {
        return (target || state.outputTarget || 'list') === 'list';
    }

    function isTableViewActive() {
        if (typeof global.tcRightViewMode === 'string') {
            return global.tcRightViewMode === 'table';
        }
        var panel = $('tc-vxe-table-view-panel');
        return !!(panel && !panel.classList.contains('hidden'));
    }

    function isGenStageQualityMode(ui) {
        return !!(ui && typeof ui.isQualityMode === 'function' && ui.isQualityMode());
    }

    function resolveStreamOutputTarget(openOpts) {
        if (openOpts && openOpts.outputTarget) {
            return openOpts.outputTarget === 'mindmap' ? 'mindmap' : 'list';
        }
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.getOutputTarget === 'function') {
            return global.TcGenerationStreamClient.getOutputTarget();
        }
        return state.outputTarget || 'list';
    }

    function isWriteTablePhase(opts) {
        opts = opts || {};
        var streamStep = opts.streamStep || opts.step || '';
        if (streamStep === 'write') return true;

        var stepId = opts.stepId || '';
        if (stepId === 'parse_rows') {
            var text = [opts.stage, opts.detail, opts.meta].join(' ');
            if (/写入/.test(text)) return true;
        }

        var stage = String(opts.stage || '');
        if (stage === '写入表格' || /写入表格/.test(stage)) return true;
        return false;
    }

    function markWriteTableStarted(opts) {
        if (!state.visible || !isListTarget()) return;
        if (isWriteTablePhase(opts || {})) {
            state.writeTableStarted = true;
        }
    }

    function resetWriteTablePeek() {
        state.writeTableStarted = false;
        setTablePeekMode(false);
    }

    function ensureTableShieldDom(el) {
        if (!el || el.querySelector('.tc-gen-table-overlay__table-shield')) return;
        var shield = document.createElement('div');
        shield.className = 'tc-gen-table-overlay__table-shield';
        shield.setAttribute('aria-hidden', 'true');
        var content = el.querySelector('.tc-gen-table-overlay__content');
        if (content) el.insertBefore(shield, content);
        else el.appendChild(shield);
    }

    function setTablePeekMode(on) {
        var el = $('tc-gen-table-overlay');
        var mount = getMount();
        var enable = !!on && state.visible;
        var wasPeek = state.tablePeek;

        if (el) ensureTableShieldDom(el);

        state.tablePeek = enable;

        if (el) {
            el.classList.toggle('tc-gen-table-overlay--table-peek', enable);
            if (enable && !wasPeek) {
                el.classList.add('tc-gen-table-overlay--peek-animate');
                global.setTimeout(function () {
                    if (el) el.classList.remove('tc-gen-table-overlay--peek-animate');
                }, 580);
            }
            if (!enable) {
                el.classList.remove('tc-gen-table-overlay--peek-animate');
            }
        }
        if (mount) {
            mount.classList.toggle('tc-vxe-table-view-panel--gen-overlay-peek', enable);
            mount.classList.toggle('tc-vxe-table-view-panel--gen-overlay-readonly', enable);
        }
    }

    function syncTablePeekMode(opts) {
        if (!state.visible) {
            resetWriteTablePeek();
            return;
        }
        markWriteTableStarted(opts);
        setTablePeekMode(state.writeTableStarted);
    }

    function setProgress(percent) {
        var el = $('tc-gen-table-overlay');
        if (!el) return;
        var rounded = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        var fill = el.querySelector('.tc-gen-table-overlay__progress-fill');
        var bar = el.querySelector('.tc-gen-table-overlay__progress');
        if (fill) fill.style.width = rounded + '%';
        if (bar) bar.setAttribute('aria-valuenow', String(rounded));
    }

    function update(opts) {
        opts = opts || {};
        var el = $('tc-gen-table-overlay');
        if (!el) return;
        var stageEl = el.querySelector('.tc-gen-table-overlay__stage');
        var metaEl = el.querySelector('.tc-gen-table-overlay__meta');
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
        if (!isListTarget(opts.outputTarget)) return;
        if (!isTableViewActive()) return;

        var el = ensureOverlayDom();
        if (!el) return;

        state.visible = true;
        state.outputTarget = opts.outputTarget || 'list';
        resetWriteTablePeek();

        update({
            stage: opts.stage || '连接模型',
            meta: opts.meta != null ? opts.meta : '准备中…',
            percent: opts.percent != null ? opts.percent : 0
        });

        el.classList.remove('hidden');
        el.classList.add('tc-gen-table-overlay--visible');
        el.setAttribute('aria-hidden', 'false');
        el.setAttribute('aria-busy', 'true');

        var mount = getMount();
        if (mount) mount.classList.add('tc-vxe-table-view-panel--gen-overlay');
    }

    function hide() {
        resetWriteTablePeek();
        state.visible = false;
        var el = $('tc-gen-table-overlay');
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('tc-gen-table-overlay--visible');
        el.setAttribute('aria-hidden', 'true');
        el.removeAttribute('aria-busy');
        var mount = getMount();
        if (mount) mount.classList.remove('tc-vxe-table-view-panel--gen-overlay');
    }

    function pipelineStepLabel(stepId) {
        return PIPELINE_STEP_LABELS[stepId] || '';
    }

    function streamStepLabel(step, detail) {
        if (STREAM_STEP_LABELS[step]) return STREAM_STEP_LABELS[step];
        return detail || '';
    }

    function applyOverlayFromPipelineStep(stepId, status, detail) {
        if (!state.visible) return;
        if (!stepId || stepId === 'quality_check') return;
        if (status !== 'active' && status !== 'running') return;

        var label = pipelineStepLabel(stepId);
        var detailText = String(detail || '').trim();
        var stage = label || detailText || '生成中…';
        var meta = detailText;
        if (label && detailText && detailText !== label) {
            meta = detailText;
        } else if (label && (!detailText || detailText === label)) {
            meta = '';
        }
        update({ stage: stage, meta: meta });
        syncTablePeekMode({ stepId: stepId, stage: stage, detail: detailText, meta: meta });
    }

    function applyOverlayFromStreamUpdate(opts) {
        opts = opts || {};
        if (!state.visible) return;

        var stage = streamStepLabel(opts.step, opts.detail) || '生成中…';
        var metaParts = [];
        if (opts.parsedRows > 0) metaParts.push('已解析 ' + opts.parsedRows + ' 条');
        if (opts.moduleName) metaParts.push(opts.moduleName);
        if (opts.detail) {
            var detail = String(opts.detail).trim();
            if (detail && detail !== stage) metaParts.push(detail);
        }
        var meta = metaParts.join(' · ');
        update({
            stage: stage,
            meta: meta
        });
        syncTablePeekMode({
            streamStep: opts.step,
            step: opts.step,
            stage: stage,
            detail: opts.detail,
            meta: meta
        });
    }

    function shouldHideForStreamProgress(opts) {
        opts = opts || {};
        return opts.step === 'done' || opts.step === 'error' || opts.step === 'cancelled';
    }

    function shouldHideForStreamRelease(opts) {
        opts = opts || {};
        if (opts.status === 'cancelled' || opts.status === 'error') return true;
        if (opts.immediate) return true;
        if (opts.parsedRows != null || opts.detail) return true;
        return false;
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

    function installGenStageHooks() {
        if (state.stageHooked || !global.TcGenStageUi) return false;
        state.stageHooked = true;
        var ui = global.TcGenStageUi;

        wrapMethod(ui, 'show', function (opts) {
            opts = opts || {};
            if (isGenStageQualityMode(ui)) return;
            show({
                outputTarget: opts.outputTarget,
                stage: '连接模型',
                meta: '准备中…',
                percent: 0
            });
        });

        wrapMethod(ui, 'hide', function () { hide(); });
        wrapMethod(ui, 'complete', function () { hide(); });
        wrapMethod(ui, 'showGenerationPaused', function () { hide(); });
        wrapMethod(ui, 'showQualityCheck', function () { hide(); });
        wrapMethod(ui, 'hideQualityCheck', function () { /* no-op */ });

        wrapMethod(ui, 'syncStreamProgress', function (opts) {
            opts = opts || {};
            if (!state.visible) return;
            if (shouldHideForStreamProgress(opts)) {
                hide();
                return;
            }
            applyOverlayFromStreamUpdate(opts);
        });

        wrapMethod(ui, 'syncStage', function (stepId, status, detail) {
            applyOverlayFromPipelineStep(stepId, status, detail);
            if (state.visible && status === 'active') {
                syncTablePeekMode({ stepId: stepId, detail: detail, stage: pipelineStepLabel(stepId) });
            }
        });

        wrapMethod(ui, 'updateProgress', function (percent) {
            if (!state.visible || isGenStageQualityMode(ui)) return;
            setProgress(percent);
        });

        wrapMethod(ui, 'updateMeta', function (_title, metaText) {
            if (!state.visible || metaText == null || isGenStageQualityMode(ui)) return;
            update({ meta: metaText });
        });

        wrapMethod(ui, 'updateStageLabel', function (label) {
            if (!state.visible || !label || isGenStageQualityMode(ui)) return;
            update({ stage: label });
            syncTablePeekMode({ stage: label });
        });

        return true;
    }

    function installStreamUiHooks() {
        var streamUi = global.TcGenerationStreamUi;
        if (!streamUi || streamUi._tcGenTableOverlayStreamHooked) return true;
        streamUi._tcGenTableOverlayStreamHooked = true;

        wrapMethod(streamUi, 'open', function (_label, openOpts) {
            var target = resolveStreamOutputTarget(openOpts);
            if (!isListTarget(target) || !isTableViewActive()) return;
            show({
                outputTarget: target,
                stage: '连接模型',
                meta: '准备中…',
                percent: 0
            });
        });

        wrapMethod(streamUi, 'releaseAfterGenerate', function (opts) {
            if (!state.visible) return;
            if (shouldHideForStreamRelease(opts || {})) hide();
        });

        wrapMethod(streamUi, 'update', function (opts) {
            if (!state.visible) return;
            opts = opts || {};
            if (shouldHideForStreamProgress(opts)) {
                hide();
                return;
            }
            if (opts.step === 'write') {
                state.writeTableStarted = true;
            }
            applyOverlayFromStreamUpdate(opts);
        });

        wrapMethod(streamUi, 'close', function () {
            if (state.visible) hide();
        });

        return true;
    }

    function installStreamClientHooks() {
        var client = global.TcGenerationStreamClient;
        if (!client || client._tcGenTableOverlayClientHooked) return true;
        client._tcGenTableOverlayClientHooked = true;

        wrapMethod(client, 'cancel', function () {
            if (state.visible) hide();
        });

        return true;
    }

    function installPipelineHooks() {
        var pipeline = global.TcGenChatPipeline;
        if (!pipeline || pipeline._tcGenTableOverlayPipelineHooked) return true;
        pipeline._tcGenTableOverlayPipelineHooked = true;

        wrapMethod(pipeline, 'setPhase', function (stepId, status, detail) {
            applyOverlayFromPipelineStep(stepId, status, detail);
        });

        wrapMethod(pipeline, 'syncStreamStep', function (opts) {
            if (!state.visible) return;
            opts = opts || {};
            if (shouldHideForStreamProgress(opts)) return;
            applyOverlayFromStreamUpdate(opts);
        });

        wrapMethod(pipeline, 'syncStreamProgressStep', function (opts) {
            if (!state.visible) return;
            opts = opts || {};
            if (shouldHideForStreamProgress(opts)) return;
            applyOverlayFromStreamUpdate(opts);
        });

        return true;
    }

    function bindPipelineStepEvent() {
        if (global._tcGenTableOverlayPipelineEventBound) return;
        global._tcGenTableOverlayPipelineEventBound = true;
        global.addEventListener('tc-gen-pipeline-step', function (e) {
            var detail = (e && e.detail) || {};
            applyOverlayFromPipelineStep(detail.stepId, detail.status, detail.detail);
        });
    }


    function installIncrementalWriteHooks() {
        var orig = global.appendParsedRowsIncremental;
        if (!orig || orig._tcGenTableOverlayWriteHooked) return true;
        orig._tcGenTableOverlayWriteHooked = true;
        global.appendParsedRowsIncremental = function (rows, opts) {
            opts = opts || {};
            var result = orig.apply(this, arguments);
            if (state.visible && isListTarget() && opts.streaming && rows && rows.length) {
                state.writeTableStarted = true;
                setTablePeekMode(true);
            }
            return result;
        };
        return true;
    }

    function tryInstallHooks() {
        var stageReady = installGenStageHooks();
        installStreamUiHooks();
        installStreamClientHooks();
        installPipelineHooks();
        installIncrementalWriteHooks();
        bindPipelineStepEvent();
        if (stageReady) return;
        global.setTimeout(tryInstallHooks, 300);
    }

    global.TcGenTableOverlay = {
        show: show,
        hide: hide,
        update: update,
        isVisible: function () { return state.visible; },
        isTablePeek: function () { return state.tablePeek; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            global.setTimeout(tryInstallHooks, 200);
        });
    } else {
        global.setTimeout(tryInstallHooks, 200);
    }
})(typeof window !== 'undefined' ? window : this);
