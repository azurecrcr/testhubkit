/**
 * AI 转换 Excel：表格用例 → AI 要素分类法思维导图（流式 + 导图区转换态，与其他功能隔离）
 */
(function (global) {
    'use strict';

    var tcAiTableToMindmapConverting = false;

    function scheduleTcMindmapRenderAfterAiConvert() {
        if (typeof global.tcMindmapRenderWhenReady === 'function') {
            global.tcMindmapRenderWhenReady({ releaseInstance: false });
            return;
        }
        if (typeof global.tcMindmapPaintView === 'function') {
            global.tcMindmapPaintView({ releaseInstance: false });
            return;
        }
        if (typeof global.renderTcMindmap === 'function') {
            global.renderTcMindmap({ forceLayout: true, releaseInstance: false });
        }
    }

    function installTcAiTableConvertViewGuard() {
        if (typeof global.switchTcRightView !== 'function') return false;
        if (global.switchTcRightView._tcAiTableConvertGuard) return true;
        var origSwitch = global.switchTcRightView;
        global.switchTcRightView = function (mode) {
            if (mode === 'table' && global.tcAiTableToMindmapConverting) return;
            return origSwitch.apply(this, arguments);
        };
        global.switchTcRightView._tcAiTableConvertGuard = true;
        return true;
    }

    var tcAiTableConvertWorkbenchLockActive = false;
    var tcAiTableConvertLockCaptureBound = false;

    function getTcAiTableConvertWorkbenchScope() {
        return document.querySelector('.tc-workbench-scope');
    }

    function setTcAiTableConvertLockEl(el, locked) {
        if (!el) return;
        if (locked) {
            if (!el.hasAttribute('data-tc-ai-convert-prev-disabled')) {
                el.setAttribute('data-tc-ai-convert-prev-disabled', el.disabled ? '1' : '0');
            }
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            el.classList.add('tc-ai-convert-lock-disabled');
        } else {
            var prev = el.getAttribute('data-tc-ai-convert-prev-disabled');
            if (prev !== null) {
                el.disabled = prev === '1';
                el.removeAttribute('data-tc-ai-convert-prev-disabled');
            } else {
                el.disabled = false;
            }
            el.removeAttribute('aria-disabled');
            el.classList.remove('tc-ai-convert-lock-disabled');
        }
    }

    function setTcAiTableConvertAiFabLock(locked) {
        var dock = document.getElementById('tc-left-float-dock');
        if (!dock) return;
        dock.classList.toggle('tc-ai-table-convert-ai-fab-lock', !!locked);
        dock.querySelectorAll('.tc-left-float-dock__mode').forEach(function (btn) {
            setTcAiTableConvertLockEl(btn, locked);
        });
    }

    function onTcAiTableConvertWorkbenchLockCapture(e) {
        if (!global.tcAiTableToMindmapConverting) return;
        var target = e.target;
        if (!target || !target.closest) return;
        var blocked = target.closest(
            '#tc-right-view-table-btn,' +
            '#tc-lanhu-tree-head-add-btn,' +
            '#tc-lanhu-tree-connect-btn,' +
            '[data-tc-lanhu-tree-connect],' +
            '.tc-lanhu-tree-node__row[data-tree-select],' +
            '.tc-lanhu-tree-node__refresh,' +
            '.tc-lanhu-tree-node__gen,' +
            '#tc-left-float-dock,' +
            '.tc-left-float-dock__mode[data-tc-float-open],' +
            '.tc-left-float-dock__mode[data-tc-float-drawer]'
        );
        if (!blocked) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }
    }

    function installTcAiTableConvertWorkbenchLockCapture() {
        if (tcAiTableConvertLockCaptureBound) return;
        tcAiTableConvertLockCaptureBound = true;
        document.addEventListener('click', onTcAiTableConvertWorkbenchLockCapture, true);
        document.addEventListener('pointerdown', onTcAiTableConvertWorkbenchLockCapture, true);
    }

    function beginTcAiTableConvertWorkbenchLock() {
        if (tcAiTableConvertWorkbenchLockActive) return;
        tcAiTableConvertWorkbenchLockActive = true;
        installTcAiTableConvertWorkbenchLockCapture();
        var scope = getTcAiTableConvertWorkbenchScope();
        if (scope) scope.classList.add('tc-ai-table-convert-workbench-lock');
        setTcAiTableConvertLockEl(document.getElementById('tc-right-view-table-btn'), true);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-head-add-btn'), true);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-connect-btn'), true);
        setTcAiTableConvertLockEl(document.querySelector('#tc-lanhu-tree-mount [data-tc-lanhu-tree-connect]'), true);
        setTcAiTableConvertAiFabLock(true);
    }

    function endTcAiTableConvertWorkbenchLock() {
        if (!tcAiTableConvertWorkbenchLockActive) return;
        tcAiTableConvertWorkbenchLockActive = false;
        var scope = getTcAiTableConvertWorkbenchScope();
        if (scope) scope.classList.remove('tc-ai-table-convert-workbench-lock');
        setTcAiTableConvertLockEl(document.getElementById('tc-right-view-table-btn'), false);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-head-add-btn'), false);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-connect-btn'), false);
        setTcAiTableConvertLockEl(document.querySelector('#tc-lanhu-tree-mount [data-tc-lanhu-tree-connect]'), false);
        setTcAiTableConvertAiFabLock(false);
    }

    var tcAiTableConvertAbortController = null;
    var tcAiTableConvertMindmapSnapshot = null;
    var tcAiTableConvertUserCancelled = false;
    var tcAiTableConvertCancelHandled = false;

    var tcAiTableConvertStreamRaf = null;
    var tcAiTableConvertThinkingRaf = null;
    var tcAiTableConvertStreamPinned = true;
    var tcAiTableConvertStreamScrollEl = null;
    var tcAiTableConvertStreamOnScroll = null;
    var TC_AI_TABLE_CONVERT_STREAM_BOTTOM_THRESHOLD = 28;

    var tcAiTableConvertLoadingDefaultHtml = null;

    function getTcAiTableConvertLoadingDefaultHtml() {
        if (tcAiTableConvertLoadingDefaultHtml) return tcAiTableConvertLoadingDefaultHtml;
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return '';
        tcAiTableConvertLoadingDefaultHtml = loadingEl.innerHTML;
        return tcAiTableConvertLoadingDefaultHtml;
    }

    function mountTcAiTableConvertLoadingChrome() {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return;
        getTcAiTableConvertLoadingDefaultHtml();
        loadingEl.innerHTML =
            '<div class="tc-ai-convert-shell">' +
            '  <div class="tc-ai-convert-card" role="status">' +
            '    <div class="tc-ai-convert-card__head">' +
            '      <div class="tc-ai-convert-orbit" aria-hidden="true">' +
            '        <span class="tc-ai-convert-orbit__ring"></span>' +
            '        <span class="tc-ai-convert-orbit__dot"></span>' +
            '        <span class="tc-ai-convert-orbit__label">AI</span>' +
            '      </div>' +
            '      <div class="tc-ai-convert-card__copy">' +
            '        <p class="tc-ai-convert-card__title" data-tc-ai-convert-title>AI 正在转换思维导图</p>' +
            '        <p class="tc-ai-convert-card__sub" data-tc-ai-convert-sub>正在读取表格用例并调用 AI…</p>' +
            '      </div>' +
            '    </div>' +
            '    <div class="tc-ai-convert-card__track" aria-hidden="true">' +
            '      <span class="tc-ai-convert-card__track-fill"></span>' +
            '    </div>' +
            '    <div class="tc-ai-convert-card__stream" id="tc-ai-table-convert-stream-mount">' +
            '      <div class="tc-ai-table-convert-thinking__label">AI 思考过程</div>' +
            '      <pre class="tc-ai-table-convert-stream" id="tc-ai-table-convert-stream" aria-live="polite" aria-label="AI 思考过程">等待 AI 响应…</pre>' +
            '    </div>' +
            '    <div class="tc-ai-convert-card__actions">' +
            '      <button type="button" class="tc-ai-convert-cancel-btn" id="tc-ai-table-convert-cancel-btn">取消转换</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
    }


    function snapshotTcAiTableConvertMindmapState() {
        var cases = global.tcMindmapCasesData;
        var snapCases = Array.isArray(cases)
            ? cases.map(function (row) { return Array.isArray(row) ? row.slice() : row; })
            : [];
        var prov = global.tcMindmapCasesProvenance;
        return {
            cases: snapCases,
            provenance: Array.isArray(prov) ? prov.slice() : prov,
            external: global.tcMindmapExternalMindData,
            committed: global.tcMindmapCommittedExternalMind,
            rootTopic: global.tcMindmapRootTopic
        };
    }

    function restoreTcAiTableConvertMindmapSnapshot() {
        var snap = tcAiTableConvertMindmapSnapshot;
        if (!snap) return;
        global.tcMindmapCasesData = snap.cases.map(function (row) {
            return Array.isArray(row) ? row.slice() : row;
        });
        if (typeof global.tcMindmapCasesProvenance !== 'undefined') {
            global.tcMindmapCasesProvenance = Array.isArray(snap.provenance)
                ? snap.provenance.slice()
                : snap.provenance;
        }
        global.tcMindmapExternalMindData = snap.external;
        global.tcMindmapCommittedExternalMind = snap.committed;
        window.tcMindmapExternalMindData = snap.external;
        window.tcMindmapCommittedExternalMind = snap.committed;
        if (snap.rootTopic !== undefined && snap.rootTopic !== null) {
            global.tcMindmapRootTopic = snap.rootTopic;
        }
        scheduleTcMindmapRenderAfterAiConvert();
    }

    function clearTcAiTableConvertMindmapSnapshot() {
        tcAiTableConvertMindmapSnapshot = null;
    }

    function isTcAiTableConvertCancelledError(err) {
        if (tcAiTableConvertUserCancelled) return true;
        if (!err) return false;
        if (err.name === 'TcAiTableConvertCancelledError' || err.name === 'AbortError') return true;
        var msg = String(err.message || '');
        return /aborted|已取消转换|cancelled/i.test(msg);
    }

    function finishTcAiTableConvertUserCancel() {
        if (tcAiTableConvertCancelHandled) return;
        tcAiTableConvertCancelHandled = true;
        restoreTcAiTableConvertMindmapSnapshot();
        clearTcAiTableConvertMindmapSnapshot();
        endTcAiTableConvertMindmapUi();
        tcAiTableToMindmapConverting = false;
        global.tcAiTableToMindmapConverting = false;
        global._tcAiTableConvertSucceededOnMindmap = false;
        endTcAiTableConvertWorkbenchLock();
        resetTcAiTableConvertAbortState();
        if (typeof global.endTcExportExcelLoading === 'function') {
            global.endTcExportExcelLoading();
        }
        if (typeof global.syncTcExportFabSheetItemsChrome === 'function') {
            global.syncTcExportFabSheetItemsChrome();
        }
        if (typeof global.switchTcRightView === 'function') {
            global.switchTcRightView('table');
        }
    }

    function performTcAiTableConvertCancel() {
        if (!global.tcAiTableToMindmapConverting) return;
        tcAiTableConvertUserCancelled = true;
        if (tcAiTableConvertAbortController) {
            try { tcAiTableConvertAbortController.abort(); } catch (abortErr) { /* ignore */ }
        }
        updateTcAiTableConvertLoadingCopy('正在取消转换…', '已通知服务端停止生成');
        setTcAiTableConvertLockEl(document.getElementById('tc-ai-table-convert-cancel-btn'), true);
    }

    function bindTcAiTableConvertCancelButton() {
        var btn = document.getElementById('tc-ai-table-convert-cancel-btn');
        if (!btn || btn._tcAiTableConvertCancelBound) return;
        btn._tcAiTableConvertCancelBound = true;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            cancelTcAiTableConvert();
        });
    }

    function cancelTcAiTableConvert() {
        if (!global.tcAiTableToMindmapConverting) return;
        if (typeof global.tcAppConfirm === 'function') {
            global.tcAppConfirm('确定要取消当前 AI 转导图吗？取消后将返回表格用例视图。', {
                title: '取消转换',
                confirmText: '确定取消',
                cancelText: '继续转换',
                variant: 'warning'
            }).then(function (ok) {
                if (ok) performTcAiTableConvertCancel();
            });
            return;
        }
        if (typeof global.confirm === 'function' && !global.confirm('确定要取消当前 AI 转导图吗？')) {
            return;
        }
        performTcAiTableConvertCancel();
    }

    function resetTcAiTableConvertAbortState() {
        tcAiTableConvertAbortController = null;
        tcAiTableConvertUserCancelled = false;
    }

    function restoreTcAiTableConvertLoadingChrome() {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return;
        var html = getTcAiTableConvertLoadingDefaultHtml();
        if (html) loadingEl.innerHTML = html;
    }


    function parseAiTableConvertSseBlock(block) {
        var lines = String(block || '').split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('data:') !== 0) continue;
            try {
                return JSON.parse(line.slice(5).trim());
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function consumeAiTableToMindmapStream(res, handlers) {
        handlers = handlers || {};
        if (!res.body || typeof res.body.getReader !== 'function') {
            return Promise.reject(new Error('浏览器不支持流式响应'));
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        var finalData = null;
        function pump() {
            return reader.read().then(function (chunk) {
                if (chunk.done) {
                    if (finalData) return finalData;
                    throw new Error('AI 转换流中断');
                }
                buf += decoder.decode(chunk.value, { stream: true });
                var parts = buf.split('\n\n');
                buf = parts.pop() || '';
                parts.forEach(function (block) {
                    var ev = parseAiTableConvertSseBlock(block);
                    if (!ev || !ev.type) return;
                    if (ev.type === 'reasoning' && ev.content && typeof handlers.onReasoning === 'function') {
                        handlers.onReasoning(String(ev.content), ev);
                    } else if (ev.type === 'content' && ev.content && typeof handlers.onContent === 'function') {
                        handlers.onContent(String(ev.content), ev);
                    } else if (ev.type === 'ai_quota' && ev.ai_quota &&
                        typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(ev.ai_quota);
                    } else if (ev.type === 'done') {
                        finalData = ev;
                    } else if (ev.type === 'cancelled') {
                        var cancelErr = new Error(ev.error || '已取消转换');
                        cancelErr.name = 'TcAiTableConvertCancelledError';
                        throw cancelErr;
                    } else if (ev.type === 'error') {
                        var streamErr = ev.error || 'AI 转换失败';
                        if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(streamErr)) {
                            throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                        }
                        throw new Error(streamErr);
                    }
                });
                return pump();
            }).catch(function (readErr) {
                if (tcAiTableConvertUserCancelled || (readErr && readErr.name === 'AbortError')) {
                    var abortedErr = new Error('已取消转换');
                    abortedErr.name = 'TcAiTableConvertCancelledError';
                    throw abortedErr;
                }
                throw readErr;
            });
        }
        return pump();
    }

    function fetchAiTableToMindmapStreamApi(columns, rows, rootTopic) {
        resetTcAiTableConvertAbortState();
        tcAiTableConvertAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var fetchOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                columns: columns,
                rows: rows,
                root_topic: rootTopic || '测试用例',
                use_builtin: true
            })
        };
        if (tcAiTableConvertAbortController) {
            fetchOpts.signal = tcAiTableConvertAbortController.signal;
        }
        return fetch('/api/test-cases/ai-table-to-mindmap/stream', fetchOpts).then(function (resp) {
            if (!resp.ok) {
                return resp.json().then(function (data) {
                    if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(data)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    var errText = (data && data.error) || ('HTTP ' + resp.status);
                    if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(errText)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    throw new Error(errText);
                }).catch(function (parseErr) {
                    if (parseErr && parseErr.message === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) {
                        throw parseErr;
                    }
                    if (parseErr && parseErr.message && parseErr.message.indexOf('HTTP') === 0) {
                        throw parseErr;
                    }
                    throw new Error('HTTP ' + resp.status);
                });
            }
            return consumeAiTableToMindmapStream(resp, {
                onReasoning: function (text) {
                    updateTcAiTableConvertThinkingPreview(text);
                },
                onContent: function (text) {
                    updateTcAiTableConvertStreamPreview(text);
                }
            });
        }).catch(function (fetchErr) {
            if (isTcAiTableConvertCancelledError(fetchErr)) {
                var cancelledErr = new Error('已取消转换');
                cancelledErr.name = 'TcAiTableConvertCancelledError';
                throw cancelledErr;
            }
            throw fetchErr;
        });
    }

    function updateTcAiTableConvertLoadingCopy(title, sub) {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return;
        var titleEl = loadingEl.querySelector('[data-tc-ai-convert-title]');
        var subEl = loadingEl.querySelector('[data-tc-ai-convert-sub]');
        if (!titleEl || !subEl) {
            var wrap = loadingEl.querySelector('.ds-loading-inline');
            if (!wrap) return;
            titleEl = wrap.querySelector('.font-medium');
            subEl = wrap.querySelector('.text-sm');
        }
        if (titleEl && title) titleEl.textContent = title;
        if (subEl && sub) subEl.textContent = sub;
    }


    function tcAiTableConvertStreamIsNearBottom(pre) {
        if (!pre) return true;
        return (pre.scrollHeight - pre.scrollTop - pre.clientHeight) <= TC_AI_TABLE_CONVERT_STREAM_BOTTOM_THRESHOLD;
    }

    function hideTcAiTableConvertStreamJumpBtn() {
        var btn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (btn) btn.classList.add('hidden');
    }

    function showTcAiTableConvertStreamJumpBtn() {
        var btn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (btn) btn.classList.remove('hidden');
    }

    function ensureTcAiTableConvertStreamJumpBtn(mount) {
        var btn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (btn) return btn;
        if (!mount) return null;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'tc-ai-table-convert-stream-jump';
        btn.className = 'tc-ai-table-convert-stream-jump hidden';
        btn.setAttribute('aria-label', '回到思考过程底部');
        btn.textContent = '↓ 回到最新';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var pre = document.getElementById('tc-ai-table-convert-stream');
            if (!pre) return;
            tcAiTableConvertStreamPinned = true;
            if (typeof pre.scrollTo === 'function') {
                pre.scrollTo({ top: pre.scrollHeight, behavior: 'smooth' });
            } else {
                pre.scrollTop = pre.scrollHeight;
            }
            hideTcAiTableConvertStreamJumpBtn();
        });
        mount.appendChild(btn);
        return btn;
    }

    function unbindTcAiTableConvertStreamScrollBehavior() {
        if (tcAiTableConvertStreamScrollEl && tcAiTableConvertStreamOnScroll) {
            tcAiTableConvertStreamScrollEl.removeEventListener('scroll', tcAiTableConvertStreamOnScroll);
        }
        tcAiTableConvertStreamScrollEl = null;
        tcAiTableConvertStreamOnScroll = null;
        tcAiTableConvertStreamPinned = true;
        hideTcAiTableConvertStreamJumpBtn();
    }

    function bindTcAiTableConvertStreamScrollBehavior(pre) {
        if (!pre) return;
        unbindTcAiTableConvertStreamScrollBehavior();
        tcAiTableConvertStreamScrollEl = pre;
        tcAiTableConvertStreamPinned = true;
        var mount = pre.parentElement;
        ensureTcAiTableConvertStreamJumpBtn(mount);
        tcAiTableConvertStreamOnScroll = function () {
            tcAiTableConvertStreamPinned = tcAiTableConvertStreamIsNearBottom(pre);
            if (tcAiTableConvertStreamPinned) {
                hideTcAiTableConvertStreamJumpBtn();
            }
        };
        pre.addEventListener('scroll', tcAiTableConvertStreamOnScroll, { passive: true });
    }

    function tcAiTableConvertStreamScrollToBottomIfPinned(pre) {
        if (!pre) return;
        if (tcAiTableConvertStreamPinned) {
            pre.scrollTop = pre.scrollHeight;
            hideTcAiTableConvertStreamJumpBtn();
        } else {
            showTcAiTableConvertStreamJumpBtn();
        }
    }

    function ensureTcAiTableConvertStreamPre() {
        var pre = document.getElementById('tc-ai-table-convert-stream');
        if (pre) {
            if (!tcAiTableConvertStreamScrollEl || tcAiTableConvertStreamScrollEl !== pre) {
                bindTcAiTableConvertStreamScrollBehavior(pre);
            }
            return pre;
        }
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return null;
        var mount = document.getElementById('tc-ai-table-convert-stream-mount');
        if (!mount) return null;
        pre = document.createElement('pre');
        pre.id = 'tc-ai-table-convert-stream';
        pre.className = 'tc-ai-table-convert-stream';
        pre.setAttribute('aria-live', 'polite');
        pre.setAttribute('aria-label', 'AI 思考过程');
        pre.textContent = '等待 AI 响应…';
        mount.appendChild(pre);
        bindTcAiTableConvertStreamScrollBehavior(pre);
        return pre;
    }

    function updateTcAiTableConvertThinkingPreview(text) {
        if (tcAiTableConvertThinkingRaf) return;
        tcAiTableConvertThinkingRaf = global.requestAnimationFrame(function () {
            tcAiTableConvertThinkingRaf = null;
            var pre = ensureTcAiTableConvertStreamPre();
            if (!pre) return;
            pre.classList.add('tc-ai-table-convert-stream--thinking');
            pre.textContent = String(text || '');
            tcAiTableConvertStreamScrollToBottomIfPinned(pre);
            updateTcAiTableConvertLoadingCopy('AI 正在转换思维导图', 'AI 正在思考…');
        });
    }

    function updateTcAiTableConvertStreamPreview(text) {
        if (tcAiTableConvertStreamRaf) return;
        tcAiTableConvertStreamRaf = global.requestAnimationFrame(function () {
            tcAiTableConvertStreamRaf = null;
            var pre = ensureTcAiTableConvertStreamPre();
            if (!pre) return;
            pre.classList.remove('tc-ai-table-convert-stream--thinking');
            pre.textContent = String(text || '');
            tcAiTableConvertStreamScrollToBottomIfPinned(pre);
            updateTcAiTableConvertLoadingCopy('AI 正在转换思维导图', '正在流式生成导图结构…');
        });
    }

    function beginTcAiTableConvertMindmapUi() {
        installTcAiTableConvertViewGuard();
        global.tcMindmapSkipCacheRestore = true;
        global.tcMindmapExternalMindData = null;
        global.tcMindmapCommittedExternalMind = null;
        window.tcMindmapExternalMindData = null;
        window.tcMindmapCommittedExternalMind = null;
        if (typeof showTcMindmapGenerating === 'function') {
            showTcMindmapGenerating();
        } else {
            global.tcMindmapGenerating = true;
            if (typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('mindmap');
            }
            if (typeof showTcMindmapGeneratingUi === 'function') {
                showTcMindmapGeneratingUi();
            }
        }
        mountTcAiTableConvertLoadingChrome();
        bindTcAiTableConvertCancelButton();
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (loadingEl) {
            loadingEl.classList.add('tc-ai-table-convert-loading');
        }
        var streamPre = ensureTcAiTableConvertStreamPre();
        if (streamPre) bindTcAiTableConvertStreamScrollBehavior(streamPre);
        updateTcAiTableConvertLoadingCopy('AI 正在转换思维导图', '正在读取表格用例并调用 AI…');
    }

    function endTcAiTableConvertMindmapUi() {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (loadingEl) {
            loadingEl.classList.remove('tc-ai-table-convert-loading');
        }
        unbindTcAiTableConvertStreamScrollBehavior();
        var jumpBtn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (jumpBtn) jumpBtn.remove();
        var pre = document.getElementById('tc-ai-table-convert-stream');
        if (pre) pre.remove();
        restoreTcAiTableConvertLoadingChrome();
        if (typeof hideTcMindmapGenerating === 'function') {
            hideTcMindmapGenerating();
        } else {
            global.tcMindmapGenerating = false;
        }
    }

    function applyAiTableToMindmapText(mindmapText) {
        var text = String(mindmapText || '').trim();
        if (!text) {
            throw new Error('AI 未返回有效的思维导图文本');
        }
        if (typeof global.ensureTcMindmapGenerateColumns === 'function') {
            global.ensureTcMindmapGenerateColumns();
        }
        global.tcMindmapCasesData = [];
        var added = 0;
        if (typeof global.parseMindmapElementClassificationResult === 'function') {
            added = global.parseMindmapElementClassificationResult(text, false);
        }
        if (!added) {
            throw new Error('未能从 AI 返回中解析到 TC: 用例行，请检查 AI 配置或重试');
        }
        var mind = null;
        if (typeof global.buildTcMindmapMindData === 'function') {
            mind = global.buildTcMindmapMindData();
        }
        if (!mind || !mind.data) {
            throw new Error('思维导图渲染数据构建失败');
        }
        global.tcMindmapExternalMindData = mind;
        global.tcMindmapCommittedExternalMind = mind;
        global.tcMindmapCachedMindPayload = null;
        global.tcMindmapSkipCacheRestore = true;
        if (typeof global.tcMindmapReleaseInstance === 'function') {
            global.tcMindmapReleaseInstance();
        }
        global.tcMindmapRootTopic = String(mind.data.topic || '测试用例');
        global.tcMindmapUndoStack = [];
        global.tcMindmapHistory = [];
        global.tcMindmapHistoryIndex = -1;
        global.tcMindmapUndoBaseline = null;
        global.tcMindmapMetaById = {};
        global.tcMindmapPendingFitFocus = true;
        if (typeof global.tcSyncWorkbenchGlobals === 'function') {
            global.tcSyncWorkbenchGlobals();
        }
        endTcAiTableConvertMindmapUi();
        clearTcAiTableConvertMindmapSnapshot();
        if (typeof global.switchTcRightView === 'function') {
            global.switchTcRightView('mindmap');
        }
        scheduleTcMindmapRenderAfterAiConvert();
        global._tcAiTableConvertSucceededOnMindmap = true;
        if (typeof global.tcMindmapPersistCache === 'function') {
            global.setTimeout(function () {
                global.tcMindmapPersistCache();
            }, 500);
        }
        if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
            typeof global.TcRequirementMindmapStore.persistAfterAiConvert === 'function') {
            global.setTimeout(function () {
                global.TcRequirementMindmapStore.persistAfterAiConvert();
            }, 650);
        }
        return added;
    }

    function prepareMindmapForAiTableConvert(choice) {
        if (choice === 'append') return;
        global.tcMindmapCasesData = [];
        if (typeof global.tcMindmapCasesProvenance !== 'undefined') {
            global.tcMindmapCasesProvenance = [];
        }
        global.tcMindmapExternalMindData = null;
        global.tcMindmapCommittedExternalMind = null;
        window.tcMindmapExternalMindData = null;
        window.tcMindmapCommittedExternalMind = null;
    }


    var tcAiMindmapConfirmResolve = null;

    function initTcAiMindmapConfirmModalUi() {
        if (global._tcAiMindmapConfirmModalInited) return;
        global._tcAiMindmapConfirmModalInited = true;
        var modal = document.getElementById('tc-ai-mindmap-confirm-modal');
        var closeBtn = document.getElementById('tc-ai-mindmap-confirm-close');
        var cancelBtn = document.getElementById('tc-ai-mindmap-confirm-cancel');
        var submitBtn = document.getElementById('tc-ai-mindmap-confirm-submit');
        if (closeBtn) closeBtn.addEventListener('click', function () { closeTcAiMindmapConfirmModal('cancel'); });
        if (cancelBtn) cancelBtn.addEventListener('click', function () { closeTcAiMindmapConfirmModal('cancel'); });
        if (submitBtn) submitBtn.addEventListener('click', function () { closeTcAiMindmapConfirmModal('confirm'); });
        var backdrop = modal && modal.querySelector('.tc-ai-mindmap-confirm-modal__backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', function () { closeTcAiMindmapConfirmModal('cancel'); });
        }
    }

    function openTcAiMindmapConfirmModal() {
        initTcAiMindmapConfirmModalUi();
        var modal = document.getElementById('tc-ai-mindmap-confirm-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeTcAiMindmapConfirmModal(choice) {
        var modal = document.getElementById('tc-ai-mindmap-confirm-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (typeof tcAiMindmapConfirmResolve === 'function') {
            var resolve = tcAiMindmapConfirmResolve;
            tcAiMindmapConfirmResolve = null;
            resolve(choice || 'cancel');
        }
    }

    function askTcAiMindmapConvertConfirm() {
        return new Promise(function (resolve) {
            tcAiMindmapConfirmResolve = resolve;
            openTcAiMindmapConfirmModal();
        });
    }

    function runConvertTableToMindmapViaAiForCurrentPage() {
        if (typeof global.closeTcTableFabSheet === 'function') {
            global.closeTcTableFabSheet();
        }
        if (typeof global.ensureTcTableTemplateApplied === 'function' &&
            !global.ensureTcTableTemplateApplied()) {
            return;
        }
        if (tcAiTableToMindmapConverting) return;

        var btn = document.getElementById('export-excel-btn');
        var started = typeof global.beginTcExportExcelLoading === 'function'
            ? global.beginTcExportExcelLoading()
            : true;
        if (!started) return;

        if (btn) {
            var spans = btn.querySelectorAll('span');
            var labelSpan = spans.length > 1 ? spans[spans.length - 1] : null;
            if (labelSpan) labelSpan.textContent = 'AI转换中…';
        }

        var pull = (global.TcTableView && typeof global.TcTableView.pullRows === 'function')
            ? global.TcTableView.pullRows()
            : Promise.resolve(true);

        pull.then(function () {
            var rows = typeof global.collectTableRowsForMindmapConvert === 'function'
                ? global.collectTableRowsForMindmapConvert()
                : [];
            if (!rows.length) {
                throw new Error('表格中还没有有效用例。请确保至少一行包含「用例名称」。');
            }
            return Promise.resolve().then(function () {
                if (typeof global.tcMindmapHasCaseData !== 'function' || !global.tcMindmapHasCaseData()) {
                    return 'overwrite';
                }
                return global.askTcViewConvertChoice({
                    title: '思维导图已有数据',
                    message: '当前思维导图中已有用例。覆盖将替换全部导图内容；追加会把现有用例与表格用例合并后重新生成；取消则不执行 AI 转换。'
                });
            }).then(function (choice) {
                if (choice === 'cancel') return null;
                var apiRows = rows;
                if (choice === 'append') {
                    var existing = [];
                    var nameCol = typeof global.resolveTcCaseNameColumnIndex === 'function'
                        ? global.resolveTcCaseNameColumnIndex()
                        : 0;
                    (global.tcMindmapCasesData || []).forEach(function (row) {
                        if (!row) return;
                        var copy = global.tableColumns.map(function (_, idx) {
                            return row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : '';
                        });
                        if (!String(copy[nameCol] || '').trim()) return;
                        existing.push(copy);
                    });
                    apiRows = existing.concat(rows);
                }
                tcAiTableConvertMindmapSnapshot = snapshotTcAiTableConvertMindmapState();
                prepareMindmapForAiTableConvert(choice);
                beginTcAiTableConvertMindmapUi();
                tcAiTableToMindmapConverting = true;
                global.tcAiTableToMindmapConverting = true;
                installTcAiTableConvertViewGuard();
                beginTcAiTableConvertWorkbenchLock();
                if (btn) btn.disabled = true;
                return fetchAiTableToMindmapStreamApi(global.tableColumns, apiRows, '测试用例').then(function (data) {
                    var count = applyAiTableToMindmapText(data.mindmap_text);
                    var tcLines = (data.stats && data.stats.tc_lines) || count;
                    var msg = choice === 'append'
                        ? ('AI 已追加转换思维导图，共 ' + tcLines + ' 条用例。')
                        : ('AI 已转换思维导图，共 ' + tcLines + ' 条用例。');
                    if (typeof global.tcAppToast === 'function') {
                        global.tcAppToast(msg, { variant: 'success', duration: 3200 });
                    }
                    return count;
                });
            });
        }).catch(function (err) {
            if (isTcAiTableConvertCancelledError(err)) {
                finishTcAiTableConvertUserCancel();
                return;
            }
            endTcAiTableConvertMindmapUi();
            var convertErrMsg = err && err.message ? err.message : '';
            if (convertErrMsg === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) return;
            if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(convertErrMsg)) return;
            if (convertErrMsg && typeof global.tcAppAlert === 'function') {
                global.tcAppAlert(convertErrMsg, { variant: 'error', title: 'AI转换失败' });
            }
        }).finally(function () {
            if (tcAiTableConvertCancelHandled) {
                tcAiTableConvertCancelHandled = false;
                return;
            }
            var stayMindmap = !!global._tcAiTableConvertSucceededOnMindmap;
            if (typeof global.endTcExportExcelLoading === 'function') {
                global.endTcExportExcelLoading();
            }
            if (typeof global.syncTcExportFabSheetItemsChrome === 'function') {
                global.syncTcExportFabSheetItemsChrome();
            }
            if (stayMindmap && typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('mindmap');
                scheduleTcMindmapRenderAfterAiConvert();
            }
            endTcAiTableConvertWorkbenchLock();
            resetTcAiTableConvertAbortState();
            clearTcAiTableConvertMindmapSnapshot();
            tcAiTableToMindmapConverting = false;
            global.tcAiTableToMindmapConverting = false;
            global._tcAiTableConvertSucceededOnMindmap = false;
        });
    }



    function convertTableToMindmapViaAi() {
        if (typeof global.closeTcTableFabSheet === 'function') {
            global.closeTcTableFabSheet();
        }
        if (typeof global.ensureTcTableTemplateApplied === 'function' &&
            !global.ensureTcTableTemplateApplied()) {
            return;
        }
        if (tcAiTableToMindmapConverting) return;

        askTcAiMindmapConvertConfirm().then(function (choice) {
            if (choice === 'confirm') {
                runConvertTableToMindmapViaAiForCurrentPage();
            }
        });
    }


    installTcAiTableConvertViewGuard();
    if (typeof global.addEventListener === 'function') {
        global.addEventListener('DOMContentLoaded', installTcAiTableConvertViewGuard);
    }
    global.tcAiTableToMindmapConverting = false;
    global.convertTableToMindmapViaAi = convertTableToMindmapViaAi;
})(typeof window !== 'undefined' ? window : globalThis);
