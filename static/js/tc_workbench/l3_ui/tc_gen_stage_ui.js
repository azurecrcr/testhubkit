/**
 * TestHub — 生成阶段 UI 增强（独立模块，不影响现有功能）
 * 提供：步骤指示器、进度条、实时统计、取消确认、摘要卡片
 */
(function (global) {
    'use strict';

    // ===== 常量 =====
    var GEN_STAGES = [
        { id: 'lanhu', label: '获取需求' },
        { id: 'parse_req', label: '解析需求' },
        { id: 'generate', label: 'AI 生成' },
        { id: 'parse_rows', label: '写入表格' }
    ];

    var GEN_STAGES_MODULE = [
        { id: 'lanhu', label: '获取需求' },
        { id: 'parse_req', label: '解析需求' },
        { id: 'split_modules', label: '模块拆分' },
        { id: 'generate_modules', label: '分模块生成' },
        { id: 'dedupe', label: '交叉去重' },
        { id: 'parse_rows', label: '写入表格' }
    ];

    // ===== 状态 =====
    var _state = {
        active: false,
        mode: 'generate',
        stages: GEN_STAGES.slice(),
        stageStatus: {},
        currentStage: '',
        percent: 0,
        parsedRows: 0,
        outputTarget: 'list',
        pauseScroll: false
    };

    // ===== 工具函数 =====
    function $(id) { return document.getElementById(id); }
    function getBar() { return $('tc-gen-stage-bar'); }
    function getStepper() { return $('tc-gen-stepper'); }

    function ensureBar() {
        return getBar();
    }

    // ===== 步骤指示器渲染 =====
    function renderStepper(stages) {
        var stepper = getStepper();
        if (!stepper) return;
        var html = '';
        for (var i = 0; i < stages.length; i++) {
            if (i > 0) {
                html += '<span class="tc-gen-stepper__separator" aria-hidden="true">&#8250;</span>';
            }
            html += '<span class="tc-gen-stepper__step tc-gen-stepper__step--pending" data-tc-stage-id="' + stages[i].id + '">';
            html += '<span class="tc-gen-stepper__dot" aria-hidden="true"></span>';
            html += '<span class="tc-gen-stepper__label">' + escapeHtml(stages[i].label) + '</span>';
            html += '</span>';
        }
        stepper.innerHTML = html;
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ===== 更新步骤状态 =====
    function setStageStatus(stageId, status) {
        _state.stageStatus[stageId] = status;
        _state.currentStage = stageId;

        var stepper = getStepper();
        if (!stepper) return;

        var el = stepper.querySelector('[data-tc-stage-id="' + stageId + '"]');
        if (!el) return;

        var statusClasses = ['pending', 'active', 'done', 'skip', 'error', 'cancelled'];
        statusClasses.forEach(function (cls) {
            el.classList.remove('tc-gen-stepper__step--' + cls);
        });
        el.classList.add('tc-gen-stepper__step--' + status);
    }

    // ===== 进度条 =====
    var STEP_PERCENT_MAP = {
        lanhu: 10,
        parse_req: 22,
        split_modules: 30,
        generate: 45,
        generate_modules: 55,
        dedupe: 70,
        parse_rows: 82,
        write: 88,
        quality_check: 95,
        done: 100
    };

    var _progressAnim = {
        display: 0,
        target: 0,
        rafId: null,
        monotonic: false
    };

    var GEN_PROGRESS = {
        cap: 0,
        phase: 'idle',
        preParseRaf: null
    };

    var PRE_PARSE_PROGRESS_TARGET = 80;
    var PRE_PARSE_CREEP_PER_SEC = 2.4;

    function resetGenerationProgressRuntime() {
        stopPreParseProgressCreep();
        GEN_PROGRESS.cap = 0;
        GEN_PROGRESS.phase = 'idle';
    }

    function stopPreParseProgressCreep() {
        if (GEN_PROGRESS.preParseRaf) {
            cancelAnimationFrame(GEN_PROGRESS.preParseRaf);
            GEN_PROGRESS.preParseRaf = null;
        }
    }

    function bumpGenerationProgressCap(next) {
        next = clampProgressPercent(next);
        if (next > GEN_PROGRESS.cap) GEN_PROGRESS.cap = next;
        return GEN_PROGRESS.cap;
    }

    function isGenerationParseStreamStep(step) {
        return step === 'parse' || step === 'write';
    }

    function isGenerationParseStage(stepId, status) {
        return stepId === 'parse_rows' && (status === 'active' || status === 'done');
    }

    function holdGenerationProgressAtParse() {
        stopPreParseProgressCreep();
        GEN_PROGRESS.phase = 'parsing';
        updateProgress(bumpGenerationProgressCap(PRE_PARSE_PROGRESS_TARGET), { monotonic: true });
    }

    function ensurePreParseProgressCreep() {
        if (!_state.active || _state.mode !== 'generate') return;
        if (GEN_PROGRESS.phase === 'parsing' || GEN_PROGRESS.phase === 'done') return;
        if (GEN_PROGRESS.preParseRaf) return;
        GEN_PROGRESS.phase = 'pre_parse';
        var lastTs = 0;
        function creep(ts) {
            if (!_state.active || _state.mode !== 'generate' || GEN_PROGRESS.phase === 'parsing') {
                GEN_PROGRESS.preParseRaf = null;
                return;
            }
            if (!lastTs) lastTs = ts;
            var dt = Math.min(48, Math.max(8, ts - lastTs));
            lastTs = ts;
            var next = bumpGenerationProgressCap(
                GEN_PROGRESS.cap + PRE_PARSE_CREEP_PER_SEC * (dt / 1000)
            );
            if (next >= PRE_PARSE_PROGRESS_TARGET) {
                bumpGenerationProgressCap(PRE_PARSE_PROGRESS_TARGET);
                updateProgress(PRE_PARSE_PROGRESS_TARGET, { monotonic: true });
                GEN_PROGRESS.preParseRaf = null;
                return;
            }
            updateProgress(next, { monotonic: true });
            GEN_PROGRESS.preParseRaf = requestAnimationFrame(creep);
        }
        GEN_PROGRESS.preParseRaf = requestAnimationFrame(creep);
    }

    function syncGenerationBarProgress(opts) {
        opts = opts || {};
        if (_state.parsedRows > 0 || isGenerationParseStreamStep(opts.streamStep) ||
            isGenerationParseStage(opts.stepId, opts.status)) {
            holdGenerationProgressAtParse();
            return;
        }
        if (GEN_PROGRESS.phase !== 'parsing' && GEN_PROGRESS.phase !== 'done') {
            ensurePreParseProgressCreep();
        }
    }

    function finishGenerationProgress() {
        stopPreParseProgressCreep();
        GEN_PROGRESS.phase = 'done';
        updateProgress(bumpGenerationProgressCap(100), { monotonic: true });
    }

    function clampProgressPercent(value) {
        return Math.max(0, Math.min(100, Number(value) || 0));
    }

    function cancelProgressAnim() {
        if (_progressAnim.rafId) {
            cancelAnimationFrame(_progressAnim.rafId);
            _progressAnim.rafId = null;
        }
    }

    function renderProgressVisual(percent) {
        var bar = ensureBar();
        if (!bar) return;
        var rounded = Math.round(clampProgressPercent(percent));
        var fill = bar.querySelector('.tc-gen-stage-bar__fill');
        var pct = bar.querySelector('.tc-gen-stage-bar__percent');
        var track = bar.querySelector('.tc-gen-stage-bar__track');
        if (fill) fill.style.width = rounded + '%';
        if (pct) pct.textContent = rounded + '%';
        if (track) track.setAttribute('aria-valuenow', String(rounded));
    }

    function updateProgress(percent, opts) {
        opts = opts || {};
        if (typeof opts === 'boolean') {
            opts = { immediate: opts === false };
        }
        var target = clampProgressPercent(percent);
        var monotonic = _state.mode === 'generate' && opts.monotonic !== false;
        if (monotonic && !opts.immediate) {
            target = bumpGenerationProgressCap(target);
        }
        if (monotonic && target < _progressAnim.display) {
            target = _progressAnim.display;
        }
        _state.percent = target;
        _progressAnim.target = target;
        _progressAnim.monotonic = monotonic;

        if (opts.immediate === true || opts.animate === false) {
            cancelProgressAnim();
            _progressAnim.display = target;
            renderProgressVisual(target);
            return;
        }

        if (!_progressAnim.rafId) {
            var lastTs = 0;
            function tick(ts) {
                if (!lastTs) lastTs = ts;
                var dt = Math.min(48, Math.max(8, ts - lastTs));
                lastTs = ts;
                var delta = _progressAnim.target - _progressAnim.display;
                if (_progressAnim.monotonic && delta < 0) {
                    _progressAnim.rafId = null;
                    return;
                }
                if (Math.abs(delta) < 0.2) {
                    _progressAnim.display = _progressAnim.target;
                    renderProgressVisual(_progressAnim.display);
                    _progressAnim.rafId = null;
                    return;
                }
                var speed = Math.max(0.1, Math.abs(delta) * 0.014);
                var step = speed * (dt / 16);
                if (step > Math.abs(delta)) step = Math.abs(delta);
                _progressAnim.display += delta > 0 ? step : -step;
                renderProgressVisual(_progressAnim.display);
                _progressAnim.rafId = requestAnimationFrame(tick);
            }
            _progressAnim.rafId = requestAnimationFrame(tick);
        }
    }

    // ===== 元数据更新 =====
    function updateMeta(title, metaText) {
        var bar = ensureBar();
        if (!bar) return;
        var titleEl = bar.querySelector('.tc-gen-stage-bar__title');
        var metaEl = bar.querySelector('.tc-gen-stage-bar__meta');
        if (titleEl && title != null) titleEl.textContent = title;
        if (metaEl && metaText != null) metaEl.textContent = metaText;
    }

    function updateStageLabel(label) {
        var bar = ensureBar();
        if (!bar) return;
        var labelEl = bar.querySelector('.tc-gen-stage-bar__stage-label');
        if (labelEl && label != null) {
            labelEl.textContent = label;
            labelEl.classList.toggle('hidden', !label);
        }
    }

    function setBarState(state) {
        var bar = ensureBar();
        if (!bar) return;
        bar.classList.remove('tc-gen-stage-bar--done', 'tc-gen-stage-bar--error', 'tc-gen-stage-bar--cancelled');
        if (state) bar.classList.add('tc-gen-stage-bar--' + state);
    }

    // ===== 打开/关闭 =====
    function show(opts) {
        opts = opts || {};
        clearQualityBarFadeDismissTimers();
        var bar = getBar();
        if (!bar) return;

        _state.active = true;
        _state.mode = 'generate';
        _state.stageStatus = {};
        _state.percent = 0;
        _state.parsedRows = 0;
        _state.outputTarget = opts.outputTarget || 'list';

        var useModule = !!(global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isModulePipelineActive === 'function' &&
            global.TcGenChatPipeline.isModulePipelineActive());
        _state.stages = useModule ? GEN_STAGES_MODULE.slice() : GEN_STAGES.slice();
        _state.useModule = useModule;

        renderStepper(_state.stages);
        resetGenerationProgressRuntime();
        updateProgress(0, { immediate: true, monotonic: false });
        ensurePreParseProgressCreep();
        setBarState(null);

        var title = _state.outputTarget === 'mindmap' ? '生成中 · 导图' : '生成中 · 列表';
        updateMeta(title, '准备中…');
        updateStageLabel('连接模型');

        bar.classList.remove('hidden');
        bar.style.display = 'flex';

        var stopBtn = bar.querySelector('.tc-gen-stage-bar__stop-btn');
        if (stopBtn) stopBtn.classList.remove('hidden');

        var summaryCard = $('tc-gen-summary-card');
        if (summaryCard) summaryCard.classList.add('hidden');
        syncQualityBarCloseChrome(false);

        try {
            bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) { /* ignore */ }
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    function hide() {
        clearQualityBarFadeDismissTimers();
        stopPreParseProgressCreep();
        stopQualityProgressCreep();
        _state.active = false;
        var bar = getBar();
        if (bar) {
            bar.classList.add('hidden');
            bar.style.display = '';
            syncQualityBarCloseChrome(false);
        }
        var summaryCard = $('tc-gen-summary-card');
        if (summaryCard) summaryCard.classList.add('hidden');
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    // ===== 同步流水线步骤 =====
    function syncStage(stepId, status, detail) {
        if (!_state.active || _state.mode === 'quality') return;

        var normalizedId = stepId;
        if (stepId === 'write') normalizedId = 'parse_rows';
        if (stepId === 'connect' || stepId === 'gen') normalizedId = 'generate';
        if (stepId === 'rag_context') normalizedId = 'parse_req';

        setStageStatus(normalizedId, status);

        syncGenerationBarProgress({ stepId: normalizedId, status: status });

        var stageLabel = '';
        if (_state.stages) {
            for (var j = 0; j < _state.stages.length; j++) {
                if (_state.stages[j].id === normalizedId) {
                    stageLabel = _state.stages[j].label;
                    break;
                }
            }
        }
        if (detail && status === 'active') {
            stageLabel = stageLabel ? (stageLabel + ' - ' + detail) : detail;
        }
        updateStageLabel(status === 'active' ? stageLabel : '');
    }

    // ===== 流式进度同步 =====
    function syncStreamProgress(opts) {
        if (!_state.active || _state.mode === 'quality') return;
        opts = opts || {};

        if (opts.parsedRows != null) {
            _state.parsedRows = opts.parsedRows;
        }

        var step = opts.step || '';
        var mappedStep = step;
        if (step === 'connect') mappedStep = 'generate';
        if (step === 'gen') mappedStep = 'generate';
        if (step === 'parse') mappedStep = 'parse_rows';
        if (step === 'write') mappedStep = 'parse_rows';

        if (step === 'done') {
            finishGenerationProgress();
            complete({
                totalRows: _state.parsedRows,
                outputTarget: _state.outputTarget
            });
            return;
        }
        if (step === 'error') {
            setBarState('error');
            updateStageLabel('生成出错');
            updateMeta('本次生成', opts.detail || '生成失败');
            updateProgress(100);
            hideStopBtn();
            return;
        }
        if (step === 'cancelled') {
            setBarState('cancelled');
            updateStageLabel('已取消');
            updateMeta('本次生成', '已停止');
            updateProgress(_state.percent);
            hideStopBtn();
            return;
        }

        syncStage(mappedStep, 'active', opts.detail || '');
        syncGenerationBarProgress({ streamStep: step, stepId: mappedStep, status: 'active' });

        var metaParts = [];
        if (_state.parsedRows > 0) {
            metaParts.push('已解析 ' + _state.parsedRows + ' 条');
        }
        if (opts.moduleName) {
            metaParts.push(opts.moduleName);
        }
        if (metaParts.length > 0) {
            updateMeta(null, metaParts.join(' | '));
        }
    }


    function resolveGenerationSummaryRowCount(opts) {
        opts = opts || {};
        var fallback = parseInt(opts.totalRows, 10) || parseInt(_state.parsedRows, 10) || 0;
        if ((_state.outputTarget || 'list') === 'list' &&
            typeof global.tcResolveListGenerationBatchContentRows === 'function') {
            var batchRows = global.tcResolveListGenerationBatchContentRows();
            if (batchRows > 0) return batchRows;
        }
        return fallback;
    }

    // ===== 完成 =====
    function complete(opts) {
        opts = opts || {};
        clearQualityBarFadeDismissTimers();
        _state.active = false;

        finishGenerationProgress();
        var rowCount = resolveGenerationSummaryRowCount(opts);
        var target = opts.outputTarget || _state.outputTarget || 'list';

        // 先隐藏生成中横幅
        var bar = ensureBar();
        if (bar) {
            bar.classList.add('hidden');
            bar.style.display = '';
            syncQualityBarCloseChrome(false);
        }

        // 显示完成摘要卡片（覆盖生成中横幅的位置）
        showSummaryCard(rowCount, target);
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    function hideStopBtn() {
        var bar = ensureBar();
        if (!bar) return;
        var stopBtn = bar.querySelector('.tc-gen-stage-bar__stop-btn');
        if (stopBtn) stopBtn.classList.add('hidden');
    }

    // ===== 生成暂停/停止提示（与完成摘要隔离） =====

    function resolveGenerationPausedRowCount(opts) {
        opts = opts || {};
        if (typeof global.tcResolveGenerationPausedWrittenRows === 'function') {
            return global.tcResolveGenerationPausedWrittenRows({
                hint: opts.rowCount != null ? opts.rowCount : _state.parsedRows
            });
        }
        var fallback = opts.rowCount != null ? opts.rowCount : (_state.parsedRows || 0);
        return parseInt(fallback, 10) || 0;
    }

    function handleGenerationStoppedUi(opts) {
        opts = opts || {};
        clearQualityBarFadeDismissTimers();
        _state.active = false;

        var bar = ensureBar();
        if (bar) {
            bar.classList.add('hidden');
            bar.style.display = '';
            syncQualityBarCloseChrome(false);
        }

        showGenerationPausedCard(
            resolveGenerationPausedRowCount(opts),
            opts.outputTarget || _state.outputTarget || 'list'
        );
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }


/** 覆盖模式中断：表格已回滚，横幅仅展示中断态。 */
    function tcIsOverwriteGenerationMergeMode() {
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.getMergeMode === 'function') {
            return global.TcGenerationStreamClient.getMergeMode() === 'overwrite';
        }
        return false;
    }

    function tcIsAppendGenerationMergeMode() {
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.getMergeMode === 'function') {
            return global.TcGenerationStreamClient.getMergeMode() === 'append';
        }
        return false;
    }

    /** 追加/覆盖模式中断：横幅仅展示中断态，不展示已写入条数。 */
    function tcShouldUseGenerationInterruptedPausedTitle() {
        return tcIsOverwriteGenerationMergeMode() || tcIsAppendGenerationMergeMode();
    }

    /** 追加/覆盖模式暂停且本次未写入时，横幅仅展示「已暂停」（不展示 0 条写入统计）。 */
    function tcShouldUseSimpleAppendOverwritePausedBanner(rowCount) {
        if (tcIsOverwriteGenerationMergeMode()) return true;
        if (tcIsAppendGenerationMergeMode()) return true;
        var count = parseInt(rowCount, 10) || 0;
        if (count > 0) return false;
        if (typeof global.tcHasAppendGenerationBaseline === 'function' && global.tcHasAppendGenerationBaseline()) {
            return true;
        }
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.getMergeMode === 'function') {
            var mode = global.TcGenerationStreamClient.getMergeMode();
            return mode === 'append' || mode === 'overwrite';
        }
        return true;
    }

    function showGenerationPausedCard(rowCount, target) {
        var card = $('tc-gen-summary-card');
        if (!card) return;

        clearTimeout(card._tcAutoDismissTimer);
        clearTimeout(card._tcFadeDoneTimer);
        card.classList.remove('tc-gen-summary-card--fading', 'tc-gen-summary-card--done');
        card.classList.add('tc-gen-summary-card--paused');

        var count = parseInt(rowCount, 10) || 0;
        var dest = target === 'mindmap' ? '思维导图' : '表格';
        var titleEl = card.querySelector('.tc-gen-summary-card__title');
        var countEl = card.querySelector('.tc-gen-summary-card__stat-value');
        var iconEl = card.querySelector('.tc-gen-summary-card__icon');
        var stats = card.querySelectorAll('.tc-gen-summary-card__stat');
        var statsWrap = card.querySelector('.tc-gen-summary-card__stats');
        var useSimplePaused = tcShouldUseSimpleAppendOverwritePausedBanner(count);

        if (iconEl) iconEl.textContent = '\u23F8';
        if (useSimplePaused) {
            if (titleEl) {
                titleEl.textContent = tcShouldUseGenerationInterruptedPausedTitle() ? '生成已中断' : '已暂停';
            }
            if (statsWrap) statsWrap.classList.add('hidden');
        } else {
            if (statsWrap) statsWrap.classList.remove('hidden');
            if (titleEl) {
                titleEl.textContent = count > 0
                    ? ('生成已暂停，已写入 ' + count + ' 条用例到' + dest + '。')
                    : '生成已暂停，本次未写入用例。';
            }
            if (countEl) countEl.textContent = count;
            if (stats.length > 0) {
                stats[0].innerHTML = '已写入用例：<span class="tc-gen-summary-card__stat-value">' + count + '</span> 条';
            }
            if (stats.length > 1) stats[1].textContent = '状态：已暂停';
        }

        card.classList.remove('hidden');
        card._tcAutoDismissTimer = setTimeout(function () {
            card.classList.add('tc-gen-summary-card--fading');
            card._tcFadeDoneTimer = setTimeout(function () {
                card.classList.add('hidden');
                card.classList.remove('tc-gen-summary-card--fading', 'tc-gen-summary-card--paused');
            }, 500);
        }, 5000);
    }

    // ===== 摘要卡片 =====
    function showSummaryCard(rowCount, target) {
        var card = $('tc-gen-summary-card');
        if (!card) return;

        clearTimeout(card._tcAutoDismissTimer);
        clearTimeout(card._tcFadeDoneTimer);
        card.classList.remove('tc-gen-summary-card--fading', 'tc-gen-summary-card--paused');
        card.classList.add('tc-gen-summary-card--done');

        var titleEl = card.querySelector('.tc-gen-summary-card__title');
        var countEl = card.querySelector('.tc-gen-summary-card__stat-value');
        var iconEl = card.querySelector('.tc-gen-summary-card__icon');
        var stats = card.querySelectorAll('.tc-gen-summary-card__stat');
        var statsWrap = card.querySelector('.tc-gen-summary-card__stats');
        if (statsWrap) statsWrap.classList.remove('hidden');
        if (iconEl) iconEl.textContent = '\u2705';
        if (titleEl) {
            titleEl.textContent = '生成完成！共 ' + rowCount + ' 条用例已写入' + (target === 'mindmap' ? '思维导图' : '表格') + '。';
        }
        if (countEl) countEl.textContent = rowCount;
        if (stats.length > 0) {
            stats[0].innerHTML = '生成用例：<span class="tc-gen-summary-card__stat-value">' + rowCount + '</span> 条';
        }
        if (stats.length > 1) stats[1].textContent = '状态：已完成';

        card.classList.remove('hidden');

        card._tcAutoDismissTimer = setTimeout(function () {
            card.classList.add('tc-gen-summary-card--fading');
            card._tcFadeDoneTimer = setTimeout(function () {
                card.classList.add('hidden');
                card.classList.remove('tc-gen-summary-card--fading', 'tc-gen-summary-card--done');
            }, 500);
        }, 5000);
    }

    function hideSummaryCard() {
        var card = $('tc-gen-summary-card');
        if (card) {
            clearTimeout(card._tcAutoDismissTimer);
            clearTimeout(card._tcFadeDoneTimer);
            card.classList.remove('tc-gen-summary-card--fading', 'tc-gen-summary-card--paused', 'tc-gen-summary-card--done');
            card.classList.add('hidden');
        }
    }

    // ===== 取消确认 =====
    function showCancelConfirm(onConfirm) {
        var overlay = $('tc-cancel-confirm-overlay');
        if (!overlay) {
            overlay = createCancelConfirmDom();
        }
        overlay.classList.remove('hidden');

        var confirmBtn = overlay.querySelector('.tc-cancel-confirm-card__btn--danger');
        var cancelBtn = overlay.querySelector('.tc-cancel-confirm-card__btn--secondary');

        var cleanup = function () {
            overlay.classList.add('hidden');
            if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
        };

        var handleConfirm = function () {
            cleanup();
            if (typeof onConfirm === 'function') onConfirm();
        };

        var handleCancel = function () {
            cleanup();
        };

        if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
        if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
    }

    function createCancelConfirmDom() {
        var overlay = document.createElement('div');
        overlay.id = 'tc-cancel-confirm-overlay';
        overlay.className = 'tc-cancel-confirm-overlay hidden';
        overlay.innerHTML =
            '<div class="tc-cancel-confirm-card">' +
            '<h3 class="tc-cancel-confirm-card__title">确认停止生成？</h3>' +
            '<p class="tc-cancel-confirm-card__desc">停止后已生成的用例会保留在表格中，但当前批次的生成进度将丢失。</p>' +
            '<div class="tc-cancel-confirm-card__actions">' +
            '<button type="button" class="tc-cancel-confirm-card__btn tc-cancel-confirm-card__btn--secondary">继续生成</button>' +
            '<button type="button" class="tc-cancel-confirm-card__btn tc-cancel-confirm-card__btn--danger">确认停止</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.classList.add('hidden');
        });

        return overlay;
    }

    // ===== 事件绑定 =====
    function bindPipelineEvents() {
        if (global._tcGenStageUiBound) return;
        global._tcGenStageUiBound = true;

        // 监听流水线步骤事件
        global.addEventListener('tc-gen-pipeline-step', function (e) {
            if (!_state.active) return;
            var detail = e.detail || {};
            if (detail.stepId && detail.status) {
                syncStage(detail.stepId, detail.status, detail.detail);
            }
        });

        // 停止按钮
        var bar = getBar();
        if (bar) {
            var stopBtn = bar.querySelector('.tc-gen-stage-bar__stop-btn');
            if (stopBtn && !stopBtn._tcStageStopBound) {
                stopBtn._tcStageStopBound = true;
                stopBtn.addEventListener('click', function () {
                    showCancelConfirm(function () {
                        if (typeof global.triggerTcPromptStop === 'function') {
                            global.triggerTcPromptStop();
                        } else if (global.TcGenerationStreamClient &&
                            typeof global.TcGenerationStreamClient.cancel === 'function') {
                            global.TcGenerationStreamClient.cancel();
                        }
                    });
                });
            }

            var closeBtn = bar.querySelector('.tc-gen-stage-bar__close');
            if (closeBtn && !closeBtn._tcStageCloseBound) {
                closeBtn._tcStageCloseBound = true;
                closeBtn.addEventListener('click', function () {
                    if (_state.mode === 'quality') {
                        hideQualityCheck();
                    } else {
                        hide();
                    }
                    hideSummaryCard();
                });
            }
        }

        // 摘要卡片关闭
        var summaryCard = $('tc-gen-summary-card');
        if (summaryCard) {
            var summaryClose = summaryCard.querySelector('.tc-gen-summary-card__close');
            if (summaryClose && !summaryClose._tcSummaryCloseBound) {
                summaryClose._tcSummaryCloseBound = true;
                summaryClose.addEventListener('click', hideSummaryCard);
            }
        }
    }

    // ===== 拦截现有 StreamUi 的 open/update 调用 =====
    function installStreamUiHook() {
        if (global._tcGenStageUiHooked) return;
        var origStreamUi = global.TcGenerationStreamUi;
        if (!origStreamUi) {
            // TcGenerationStreamUi 可能尚未加载，等待 500ms 重试
            global.setTimeout(installStreamUiHook, 500);
            return;
        }
        global._tcGenStageUiHooked = true;

        // 拦截 open
        var origOpen = origStreamUi.open;
        if (origOpen) {
            origStreamUi.open = function () {
                var target = 'list';
                if (global.TcGenerationStreamClient && global.TcGenerationStreamClient.getOutputTarget) {
                    target = global.TcGenerationStreamClient.getOutputTarget();
                }
                show({ outputTarget: target });
                var openOpts = arguments.length > 1 ? arguments[1] : null;
                var headless = !!(global.__tcSuppressLeftPanelUi ||
                    (openOpts && openOpts.suppressLeftPanelUi));
                if (!headless && typeof origOpen === 'function') {
                    origOpen.apply(origStreamUi, arguments);
                }
            };
        }

        // 拦截 update
        var origUpdate = origStreamUi.update;
        if (origUpdate) {
            origStreamUi.update = function (opts) {
                syncStreamProgress(opts || {});
                if (typeof origUpdate === 'function') origUpdate.apply(origStreamUi, arguments);
            };
        }

        // 拦截 close / releaseAfterGenerate
        var origClose = origStreamUi.close;
        if (origClose) {
            origStreamUi.close = function () {
                if (_state.active && _state.parsedRows > 0) {
                    complete({ totalRows: _state.parsedRows, outputTarget: _state.outputTarget });
                } else {
                    hide();
                }
                if (typeof origClose === 'function') origClose.apply(origStreamUi, arguments);
            };
        }

        var origRelease = origStreamUi.releaseAfterGenerate;
        if (origRelease) {
            origStreamUi.releaseAfterGenerate = function (opts) {
                opts = opts || {};
                if (opts.status === 'error') {
                    setBarState('error');
                    updateMeta('本次生成', opts.detail || '生成失败');
                    updateProgress(100);
                    hideStopBtn();
                } else if (opts.status === 'cancelled') {
                    handleGenerationStoppedUi({
                        rowCount: opts.parsedRows != null ? opts.parsedRows : _state.parsedRows,
                        outputTarget: _state.outputTarget
                    });
                } else if (_state.active) {
                    complete({
                        totalRows: opts.parsedRows || _state.parsedRows,
                        outputTarget: _state.outputTarget
                    });
                }
                if (typeof origRelease === 'function') origRelease.apply(origStreamUi, arguments);
            };
        }
    }


    // ===== 质量检查横幅（复用 tc-gen-stage-bar） =====
    var QC_STAGES = [
        { id: 'structure', label: '格式 / 表头检查' },
        { id: 'required', label: '关键字段检查' },
        { id: 'llm', label: 'AI 对照检查' }
    ];

    var QC_PROGRESS = {
        cap: 0,
        creepRaf: null
    };

    var QC_CREEP_PER_SEC = 2.2;

    function resetQualityProgressRuntime() {
        stopQualityProgressCreep();
        QC_PROGRESS.cap = 0;
    }

    function stopQualityProgressCreep() {
        if (QC_PROGRESS.creepRaf) {
            cancelAnimationFrame(QC_PROGRESS.creepRaf);
            QC_PROGRESS.creepRaf = null;
        }
    }

    function bumpQualityProgressCap(next) {
        next = clampProgressPercent(next);
        if (next > QC_PROGRESS.cap) QC_PROGRESS.cap = next;
        return QC_PROGRESS.cap;
    }

    function findQualityStepIndex(stepId) {
        for (var qi = 0; qi < QC_STAGES.length; qi++) {
            if (QC_STAGES[qi].id === stepId) return qi;
        }
        return -1;
    }

    function getQualityStepBounds(stepIndex, totalSteps) {
        totalSteps = totalSteps || QC_STAGES.length;
        if (totalSteps <= 0) totalSteps = 1;
        var slice = 100 / totalSteps;
        var start = stepIndex * slice;
        var done = (stepIndex + 1) * slice;
        var activeCap = start + slice * 0.92;
        if (stepIndex >= totalSteps - 1) {
            activeCap = Math.min(97, done - slice * 0.08);
        }
        return { start: start, activeCap: activeCap, done: Math.min(done, 99) };
    }

    function updateQualityProgress(percent, opts) {
        opts = opts || {};
        updateProgress(percent, {
            immediate: !!opts.immediate,
            monotonic: false,
            animate: opts.animate
        });
    }

    function ensureQualityProgressCreep(targetCap) {
        if (!_state.active || _state.mode !== 'quality') return;
        targetCap = clampProgressPercent(targetCap);
        if (QC_PROGRESS.cap >= targetCap) {
            updateQualityProgress(QC_PROGRESS.cap);
            return;
        }
        if (QC_PROGRESS.creepRaf) return;
        var lastTs = 0;
        function creep(ts) {
            if (!_state.active || _state.mode !== 'quality') {
                QC_PROGRESS.creepRaf = null;
                return;
            }
            if (!lastTs) lastTs = ts;
            var dt = Math.min(48, Math.max(8, ts - lastTs));
            lastTs = ts;
            var next = bumpQualityProgressCap(
                QC_PROGRESS.cap + QC_CREEP_PER_SEC * (dt / 1000)
            );
            if (next >= targetCap) {
                bumpQualityProgressCap(targetCap);
                updateQualityProgress(targetCap);
                QC_PROGRESS.creepRaf = null;
                return;
            }
            updateQualityProgress(next);
            QC_PROGRESS.creepRaf = requestAnimationFrame(creep);
        }
        QC_PROGRESS.creepRaf = requestAnimationFrame(creep);
    }

    function mapQualityStageStatus(status) {
        if (status === 'running') return 'active';
        if (status === 'skipped') return 'skip';
        return status || 'pending';
    }



    var _qualityBarFadeTimer = null;
    var _qualityBarFadeDoneTimer = null;
    /** 质量检查结果横幅：完成后短暂停留再快速渐隐（仅质量检测 complete/cancel 使用） */
    var QC_RESULT_BAR_HOLD_MS = 1600;
    var QC_RESULT_BAR_FADE_MS = 320;

    function clearQualityBarFadeDismissTimers() {
        if (_qualityBarFadeTimer) {
            clearTimeout(_qualityBarFadeTimer);
            _qualityBarFadeTimer = null;
        }
        if (_qualityBarFadeDoneTimer) {
            clearTimeout(_qualityBarFadeDoneTimer);
            _qualityBarFadeDoneTimer = null;
        }
        var bar = getBar();
        if (bar) bar.classList.remove('tc-gen-stage-bar--quality-fading');
    }

    function finalizeQualityBarAfterFade() {
        clearQualityBarFadeDismissTimers();
        var bar = getBar();
        if (bar) {
            bar.classList.add('hidden');
            bar.style.display = '';
            syncQualityBarCloseChrome(false);
        }
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    function scheduleQualityBarFadeDismiss() {
        clearQualityBarFadeDismissTimers();
        var bar = ensureBar();
        if (!bar) return;
        bar.classList.remove('tc-gen-stage-bar--quality-fading');
        bar.classList.remove('hidden');
        bar.style.display = 'flex';
        _qualityBarFadeTimer = setTimeout(function () {
            if (!bar || bar.classList.contains('hidden')) return;
            bar.classList.add('tc-gen-stage-bar--quality-fading');
            _qualityBarFadeDoneTimer = setTimeout(finalizeQualityBarAfterFade, QC_RESULT_BAR_FADE_MS);
        }, QC_RESULT_BAR_HOLD_MS);
    }

    function syncQualityBarCloseChrome(isQuality) {
        var bar = getBar();
        if (!bar) return;
        bar.classList.toggle('tc-gen-stage-bar--quality', !!isQuality);
        var closeBtn = bar.querySelector('.tc-gen-stage-bar__close');
        if (!closeBtn) return;
        if (isQuality) {
            closeBtn.title = '关闭质量检测横幅';
            closeBtn.setAttribute('aria-label', '关闭质量检测横幅');
        } else {
            closeBtn.title = '关闭';
            closeBtn.setAttribute('aria-label', '关闭进度条');
        }
    }

    function showQualityCheck(opts) {
        opts = opts || {};
        clearQualityBarFadeDismissTimers();
        _state.active = true;
        _state.mode = 'quality';
        _state.stageStatus = {};
        _state.percent = 0;
        _state.stages = QC_STAGES.slice();
        _state.useModule = false;

        renderStepper(_state.stages);
        resetQualityProgressRuntime();
        updateQualityProgress(0, { immediate: true });
        ensureQualityProgressCreep(getQualityStepBounds(0, QC_STAGES.length).activeCap);
        setBarState(null);
        updateMeta('质量检查中', opts.meta || '准备中…');
        updateStageLabel('');

        var bar = getBar();
        if (!bar) return;
        bar.classList.remove('hidden');
        bar.style.display = 'flex';
        hideStopBtn();
        syncQualityBarCloseChrome(true);

        var summaryCard = $('tc-gen-summary-card');
        if (summaryCard) summaryCard.classList.add('hidden');

        try {
            bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) { /* ignore */ }
    }

    function syncQualityStage(stepId, status, detail) {
        if (!_state.active || _state.mode !== 'quality') return;
        var mapped = mapQualityStageStatus(status);
        setStageStatus(stepId, mapped);

        var stepIdx = findQualityStepIndex(stepId);
        if (stepIdx >= 0) {
            var bounds = getQualityStepBounds(stepIdx, QC_STAGES.length);
            if (mapped === 'active') {
                stopQualityProgressCreep();
                bumpQualityProgressCap(bounds.start);
                ensureQualityProgressCreep(bounds.activeCap);
            } else if (mapped === 'done' || mapped === 'skip') {
                stopQualityProgressCreep();
                bumpQualityProgressCap(bounds.done);
                updateQualityProgress(bounds.done);
            } else if (mapped === 'error') {
                stopQualityProgressCreep();
                bumpQualityProgressCap(bounds.start);
                updateQualityProgress(Math.max(bounds.start, QC_PROGRESS.cap));
            }
        }

        var stageLabel = '';
        for (var i = 0; i < _state.stages.length; i++) {
            if (_state.stages[i].id === stepId) {
                stageLabel = _state.stages[i].label;
                break;
            }
        }
        if (mapped === 'active') {
            if (detail) {
                updateStageLabel(stageLabel ? (stageLabel + ' · ' + detail) : detail);
                updateMeta(null, detail);
            }
        } else if (mapped === 'done' || mapped === 'skip' || mapped === 'error') {
            updateStageLabel('');
            if (detail) updateMeta(null, detail);
        }
    }

    function completeQualityCheck(opts) {
        opts = opts || {};
        if (_state.mode !== 'quality') return;
        _state.active = false;

        var bar = ensureBar();
        if (!bar) return;

        if (opts.error) {
            setBarState('error');
            updateMeta('质量检查', opts.detail || '检查失败');
        } else {
            setBarState('done');
            updateMeta('质量检查完成', opts.detail || '检查完成');
            QC_STAGES.forEach(function (st) {
                if (_state.stageStatus[st.id] !== 'error') {
                    setStageStatus(st.id, 'done');
                }
            });
        }
        stopQualityProgressCreep();
        bumpQualityProgressCap(100);
        updateQualityProgress(100);
        updateStageLabel('');
        hideStopBtn();
        _state.mode = 'generate';
        scheduleQualityBarFadeDismiss();
    }


    function cancelQualityCheck(opts) {
        opts = opts || {};
        if (_state.mode !== 'quality') return;
        _state.active = false;
        var bar = ensureBar();
        if (!bar) return;
        setBarState('cancelled');
        updateMeta('质量检测', opts.detail || '已取消');
        updateStageLabel('已取消');
        stopQualityProgressCreep();
        hideStopBtn();
        _state.mode = 'generate';
        scheduleQualityBarFadeDismiss();
    }

    function hideQualityCheck() {
        clearQualityBarFadeDismissTimers();
        if (_state.mode === 'quality') {
            stopQualityProgressCreep();
            resetQualityProgressRuntime();
            _state.mode = 'generate';
        }
        hide();
    }


    // ===== 对外 API =====
    var api = {
        show: show,
        hide: hide,
        syncStage: syncStage,
        syncStreamProgress: syncStreamProgress,
        complete: complete,
        updateProgress: updateProgress,
        updateMeta: updateMeta,
        showCancelConfirm: showCancelConfirm,
        showSummaryCard: showSummaryCard,
        hideSummaryCard: hideSummaryCard,
        showGenerationPaused: handleGenerationStoppedUi,
        bindEvents: bindPipelineEvents,
        isActive: function () { return _state.active; },
        setParsedRows: function (n) { _state.parsedRows = n; },
        showQualityCheck: showQualityCheck,
        syncQualityStage: syncQualityStage,
        completeQualityCheck: completeQualityCheck,
        cancelQualityCheck: cancelQualityCheck,
        hideQualityCheck: hideQualityCheck,
        isQualityMode: function () { return _state.mode === 'quality'; }
    };

    global.TcGenStageUi = api;

    // ===== 初始化 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            global.setTimeout(function () {
                bindPipelineEvents();
                installStreamUiHook();
            }, 200);
        });
    } else {
        global.setTimeout(function () {
            bindPipelineEvents();
            installStreamUiHook();
        }, 200);
    }

})(typeof window !== 'undefined' ? window : this);
