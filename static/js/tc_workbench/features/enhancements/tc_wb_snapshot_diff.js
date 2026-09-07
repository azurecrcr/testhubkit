    /* ---------- 快照 Diff ---------- */

    function findNameColumn(cols) {
        for (var i = 0; i < cols.length; i++) {
            var c = String(cols[i]).toLowerCase();
            if (c.indexOf('用例名称') >= 0 || c.indexOf('用例名') >= 0 || c.indexOf('标题') >= 0) return i;
        }
        return 0;
    }

    function rowKey(cols, row) {
        var ci = findNameColumn(cols);
        return String(row[ci] != null ? row[ci] : '').trim() || JSON.stringify(row);
    }

    function computeStashDiff(baseDoc, compareDoc) {
        var a = baseDoc.payload || {};
        var b = compareDoc.payload || {};
        var colsA = a.columns || [];
        var colsB = b.columns || [];
        var cols = colsA.length ? colsA : colsB;
        var mapA = {};
        var mapB = {};
        (a.rows || []).forEach(function (r) { var k = rowKey(colsA, r); if (k) mapA[k] = r; });
        (b.rows || []).forEach(function (r) { var k = rowKey(colsB, r); if (k) mapB[k] = r; });
        var keys = {};
        Object.keys(mapA).forEach(function (k) { keys[k] = true; });
        Object.keys(mapB).forEach(function (k) { keys[k] = true; });
        var rows = [];
        var stats = { add: 0, del: 0, mod: 0, eq: 0 };
        Object.keys(keys).sort().forEach(function (k) {
            var inA = mapA[k];
            var inB = mapB[k];
            var type, baseVal, cmpVal;
            if (inA && !inB) { type = 'del'; stats.del++; baseVal = inA; cmpVal = ''; }
            else if (!inA && inB) { type = 'add'; stats.add++; baseVal = ''; cmpVal = inB; }
            else if (JSON.stringify(inA) !== JSON.stringify(inB)) { type = 'mod'; stats.mod++; baseVal = inA; cmpVal = inB; }
            else { type = 'eq'; stats.eq++; baseVal = inA; cmpVal = inB; }
            rows.push({ key: k, type: type, base: baseVal, compare: cmpVal });
        });
        return { columns: cols, rows: rows, stats: stats, baseTitle: baseDoc.title, compareTitle: compareDoc.title };
    }

    function openStashDiffModal(presetBaseId, presetCompareId) {
        var modal = $('tc-stash-diff-modal');
        if (!modal || !global.HfLocalStash) return;
        var items = HfLocalStash.tc.list().items || [];
        var baseSel = $('tc-stash-diff-base');
        var cmpSel = $('tc-stash-diff-compare');
        if (!baseSel || !cmpSel) return;
        var opts = items.map(function (it) {
            return '<option value="' + esc(it.id) + '">' + esc(it.title || it.id) + '</option>';
        }).join('');
        baseSel.innerHTML = opts;
        cmpSel.innerHTML = '<option value="__current__">当前表格</option>' + opts;
        if (presetBaseId) baseSel.value = presetBaseId;
        if (presetCompareId) cmpSel.value = presetCompareId;
        else cmpSel.value = '__current__';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        runStashDiff();
    }

    function closeStashDiffModal() {
        var modal = $('tc-stash-diff-modal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    }

    function runStashDiff() {
        var baseId = ($('tc-stash-diff-base') || {}).value;
        var cmpId = ($('tc-stash-diff-compare') || {}).value;
        if (!baseId) return;
        var baseDoc = HfLocalStash.tc.get(baseId);
        var cmpDoc;
        if (cmpId === '__current__') {
            var p = collectRowsPayload();
            cmpDoc = { title: '当前表格', payload: { columns: p.columns, rows: p.rows } };
        } else {
            cmpDoc = HfLocalStash.tc.get(cmpId);
        }
        if (!baseDoc || !cmpDoc) {
            alertBox('无法读取快照数据', { title: '对比失败' });
            return;
        }
        state.diffResult = computeStashDiff(baseDoc, cmpDoc);
        var s = state.diffResult.stats;
        var sum = $('tc-stash-diff-summary');
        if (sum) {
            sum.textContent = '对比「' + (state.diffResult.baseTitle || '') + '」与「' + (state.diffResult.compareTitle || '') +
                '」：新增' + s.add + ' · 删除' + s.del + ' · 编辑' + s.mod;
        }
        var wrap = $('tc-stash-diff-table-wrap');
        if (!wrap) return;
        var typeLabel = { add: '新增', del: '删除', mod: '编辑', eq: '无变化' };
        var html = '<table class="tc-stash-diff-table w-full border-collapse"><thead><tr class="bg-slate-50"><th class="border px-2 py-1">用例</th><th class="border px-2 py-1">变更</th><th class="border px-2 py-1">说明</th></tr></thead><tbody>';
        state.diffResult.rows.forEach(function (r) {
            if (r.type === 'eq') return;
            var cls = 'tc-diff-' + r.type;
            html += '<tr class="' + cls + '"><td class="border px-2 py-1">' + esc(r.key) + '</td><td class="border px-2 py-1">' + typeLabel[r.type] + '</td><td class="border px-2 py-1 text-xs">';
            if (r.type === 'mod') html += '字段有变更';
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        wrap.innerHTML = html || '<p class="text-slate-400">两版完全一致</p>';
    }

    function updateDiffBtnVisibility() {
        var btn = $('tc-gen-batch-diff-btn');
        if (!btn || !global.HfLocalStash) return;
        var items = HfLocalStash.tc.list().items || [];
        btn.classList.toggle('hidden', items.length < 1);
    }

    function wrapRenderStashList() {
        if (typeof global.renderTcStashList !== 'function' || global.renderTcStashList._tcDiffWrapped) return;
        var orig = global.renderTcStashList;
        global.renderTcStashList = function (items, maxVal) {
            orig.apply(this, arguments);
            var list = $('tc-stash-list');
            if (!list) return;
            list.querySelectorAll('.tc-stash-row').forEach(function (row, idx) {
                if (row.querySelector('.tc-stash-diff-btn')) return;
                var id = (items[idx] && items[idx].id) || '';
                var actions = row.querySelector('.tc-stash-row-actions');
                if (!actions || !id) return;
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tc-stash-diff-btn flex h-8 w-8 shrink-0 items-center justify-center rounded text-indigo-600 hover:bg-indigo-50';
                btn.title = '对比';
                btn.setAttribute('data-id', id);
                btn.innerHTML = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12M8 12h12M8 17h12M3 7h.01M3 12h.01M3 17h.01"/></svg>';
                actions.insertBefore(btn, actions.firstChild);
            });
            list.querySelectorAll('.tc-stash-diff-btn').forEach(function (btn) {
                if (btn._bound) return;
                btn._bound = true;
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    openStashDiffModal(btn.getAttribute('data-id'), '__current__');
                });
            });
            updateDiffBtnVisibility();
        };
        global.renderTcStashList._tcDiffWrapped = true;
    }

    function fetchAuthStatus() {
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            return global.HfAuthNav.fetchMe();
        }
        return fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .catch(function () { return { authenticated: false, user: null }; });
    }

    function syncAuthStatus() {
        return fetchAuthStatus().then(function (data) {
            state.loggedIn = !!(data && data.authenticated && data.user);
            return state.loggedIn;
        }).catch(function () {
            state.loggedIn = false;
            return false;
        });
    }

    function migrateLocalStatsToServer(batches) {
        batches = batches || [];
        if (!batches.length || !state.loggedIn) return Promise.resolve(0);
        return fetchJson('/api/test-cases/adoption-stats/import', {
            method: 'POST',
            body: JSON.stringify({ batches: batches })
        }).then(function (data) {
            try {
                global.localStorage.removeItem(TC_LOCAL_STATS_KEY);
            } catch (e) { /* ignore */ }
            return parseInt(data.imported, 10) || 0;
        });
    }

    function wrapLanhuSummary() {
        if (typeof global.fetchTcLanhuRequirementsSummary !== 'function' || global.fetchTcLanhuRequirementsSummary._tcEnhWrapped) return;
        var orig = global.fetchTcLanhuRequirementsSummary;
        global.fetchTcLanhuRequirementsSummary = function () {
            return orig.apply(this, arguments).then(function (summary) {
                if (summary) {
                    state.lastRequirements = String(summary).trim();
                    state.lastLanhuRequirements = String(summary).trim();
                    try {
                        global.dispatchEvent(new CustomEvent('tc-wb-requirements-updated'));
                    } catch (e) { /* ignore */ }
                }
                return summary;
            });
        };
        global.fetchTcLanhuRequirementsSummary._tcEnhWrapped = true;
    }

    function bindAdoptionStatsDelegation() {
        if (global._tcAdoptionStatsDelegate) return;
        global._tcAdoptionStatsDelegate = true;
        document.addEventListener('click', function (ev) {
            if (!document.querySelector('.tc-workbench-scope')) return;
            if (typeof global.isTcHubExcelTabActive === 'function' && global.isTcHubExcelTabActive()) return;
            var btn = ev.target && ev.target.closest
                ? ev.target.closest('#tc-gen-batch-progress-hit, #tc-table-fab-stats-btn')
                : null;
            if (!btn || btn.disabled) return;
            ev.preventDefault();
            ev.stopPropagation();
            openAdoptionStatsModal();
        }, true);
    }

    function bindBatchBarButtons() {
        if (global._tcEnhBatchBarBtnsBound) return;
        global._tcEnhBatchBarBtnsBound = true;
        global._tcBatchBarBtnBound = global._tcBatchBarBtnBound || {};
        function once(id, handler) {
            if (global._tcBatchBarBtnBound[id]) return;
            var el = $(id);
            if (!el) return;
            global._tcBatchBarBtnBound[id] = true;
            el.addEventListener('click', handler);
        }
        once('tc-gen-batch-mindmap-review-btn', function () {
            ensureInit();
            openMindmapReviewModal();
        });
        once('tc-gen-batch-accept-all', function () {
            ensureInit();
            if (!state.batchId) return;
            if (isLocalBatchId()) {
                for (var i = state.batchRowStart; i < state.batchRowStart + state.batchRowCount; i++) {
                    state.feedback[i] = 'accept';
                }
                updateLocalBatchStats();
                syncRowHighlight();
                toast('已全部采纳（本页）', { variant: 'success', duration: 2400 });
                return;
            }
            fetchJson('/api/test-cases/generation-batches/' + state.batchId + '/accept-all', { method: 'POST' })
                .then(function (s) { state.feedback = s.feedback || {}; paintBatchBar(s); syncRowHighlight(); });
        });
        once('tc-gen-batch-reject-all', function () {
            ensureInit();
            if (!state.batchId) return;
            if (isLocalBatchId()) {
                for (var j = state.batchRowStart; j < state.batchRowStart + state.batchRowCount; j++) {
                    state.feedback[j] = 'reject';
                }
                updateLocalBatchStats();
                syncRowHighlight();
                toast('已全部拒绝（本页）', { variant: 'info', duration: 2400 });
                return;
            }
            fetchJson('/api/test-cases/generation-batches/' + state.batchId + '/reject-all', { method: 'POST' })
                .then(function (s) { state.feedback = s.feedback || {}; paintBatchBar(s); syncRowHighlight(); });
        });
        once('tc-gen-batch-close-btn', function () {
            if (typeof global.tcHideGenBatchBar === 'function') global.tcHideGenBatchBar();
            else showBatchBar(false);
            onBatchClose();
        });
        once('tc-gen-batch-diff-btn', function () {
            ensureInit();
            var items = global.HfLocalStash ? HfLocalStash.tc.list().items || [] : [];
            if (items.length) openStashDiffModal(items[0].id, '__current__');
            else alertBox('请先在暂存区保存至少一条快照后再对比。', { title: '暂无快照' });
        });
        once('tc-gen-batch-progress-hit', function (e) {
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();
            openAdoptionStatsModal();
        });
        once('tc-table-fab-stats-btn', function (e) {
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();
            openAdoptionStatsModal();
        });
        once('tc-gen-batch-validate-btn', function () {
            ensureInit();
            runValidation(isValidateUseLlmEnabled());
        });
        once('tc-standalone-validate-btn', function () {
            ensureInit();
            runValidation(isValidateUseLlmEnabled());
        });
    }

    function bindUi() {
        bindBatchBarButtons();        if (!window._tcExportProvenanceModalInited) {
            window._tcExportProvenanceModalInited = true;
            $('tc-export-provenance-cancel') && $('tc-export-provenance-cancel').addEventListener('click', function() {
                closeTcExportProvenanceModal({ action: 'cancel' });
            });
            $('tc-export-provenance-skip') && $('tc-export-provenance-skip').addEventListener('click', function() {
                closeTcExportProvenanceModal({ action: 'skip' });
            });
            $('tc-export-provenance-apply') && $('tc-export-provenance-apply').addEventListener('click', function() {
                var select = $('tc-export-provenance-col-select');
                var colIndex = select ? parseInt(select.value, 10) : NaN;
                closeTcExportProvenanceModal({ action: 'apply', colIndex: isNaN(colIndex) ? null : colIndex });
            });
            $('tc-export-provenance-modal') && $('tc-export-provenance-modal').addEventListener('click', function(e) {
                if (e.target === $('tc-export-provenance-modal')) closeTcExportProvenanceModal({ action: 'cancel' });
            });
        }
        $('tc-export-report-close') && $('tc-export-report-close').addEventListener('click', closeExportReportModal);
        $('tc-export-report-copy') && $('tc-export-report-copy').addEventListener('click', function () {
            copyExportReportSummary(lastExportReport).then(function () {
                toast('摘要已复制', { variant: 'success', duration: 2400 });
            }).catch(function () {
                toast('复制失败', { variant: 'warning', duration: 2600 });
            });
        });
        $('tc-export-report-modal') && $('tc-export-report-modal').addEventListener('click', function (e) {
            if (e.target === $('tc-export-report-modal')) closeExportReportModal();
        });
        $('tc-stash-diff-close') && $('tc-stash-diff-close').addEventListener('click', closeStashDiffModal);
        $('tc-adoption-stats-close') && $('tc-adoption-stats-close').addEventListener('click', closeAdoptionStatsModal);
        $('tc-mindmap-review-close') && $('tc-mindmap-review-close').addEventListener('click', closeMindmapReviewModal);
        $('tc-adoption-stats-modal') && $('tc-adoption-stats-modal').addEventListener('click', function (e) {
            if (e.target === $('tc-adoption-stats-modal')) closeAdoptionStatsModal();
        });
        $('tc-adoption-stats-body') && $('tc-adoption-stats-body').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-tc-stats-action]');
            if (!btn || btn.disabled) return;
            var action = btn.getAttribute('data-tc-stats-action');
            if (action === 'prev') loadAdoptionStatsPage(statsModalPage - 1);
            else if (action === 'next') loadAdoptionStatsPage(statsModalPage + 1);
            else if (action === 'merge-local') {
                if (global.TcLoginMerge && typeof global.TcLoginMerge.promptMergeLocalHistory === 'function') {
                    global.TcLoginMerge.promptMergeLocalHistory().then(function (ok) {
                        if (ok) loadAdoptionStatsPage(statsModalPage);
                    });
                }
            }
        });
        $('tc-stash-diff-run') && $('tc-stash-diff-run').addEventListener('click', runStashDiff);
        var autoVal = $('tc-gen-auto-validate');
        var autoBtn = $('tc-gen-auto-validate-btn');
        resetGenAutoValidateToggleDefault();
        function paintValidateToggleBtn() {
            if (!autoBtn || !autoVal) return;
            var on = !!autoVal.checked;
            autoBtn.classList.remove('tc-gen-toggle-btn--locked');
            autoBtn.classList.toggle('tc-gen-toggle-btn--on', on);
            autoBtn.classList.toggle('tc-gen-toggle-btn--off', !on);
            autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        bindValidateGenButtonDelegation();
        bindValidateFloatPanel(VALIDATE_SCOPE_SINGLE);
        if (autoBtn && autoVal) {
            paintValidateToggleBtn();
        }
        if (autoVal) {
            autoVal.addEventListener('change', function () {
                paintValidateToggleBtn();
            });
        }
        bindGenOptionHelpTips();
    }


    function bindValidateGenButtonDelegation() {
        if (global._tcValidateGenBtnDelegate) return;
        global._tcValidateGenBtnDelegate = true;
        document.addEventListener('click', function (ev) {
            if (!document.querySelector('.tc-workbench-scope')) return;
            if (typeof global.isTcHubExcelTabActive === 'function' && global.isTcHubExcelTabActive()) return;
            var btn = ev.target && ev.target.closest ? ev.target.closest('#tc-gen-auto-validate-btn') : null;
            if (!btn) return;
            if (typeof global.TcAgentOrchestrator !== 'undefined' &&
                typeof global.TcAgentOrchestrator.isAgentModeEnabled === 'function' &&
                global.TcAgentOrchestrator.isAgentModeEnabled()) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            ensureInit();
            var autoVal = $('tc-gen-auto-validate');
            if (!autoVal) return;
            autoVal.checked = !autoVal.checked;
            autoVal.dispatchEvent(new Event('change', { bubbles: true }));
        }, true);
    }

    function syncGenOptionHelpDataTips() {
        document.querySelectorAll('.tc-gen-option-help-wrap').forEach(function (wrap) {
            var store = wrap.querySelector('.tc-gen-option-hint-store');
            if (!store) return;
            var text = String(store.textContent || '').trim();
            if (text) wrap.setAttribute('data-tip', text);
        });
    }

    function bindGenOptionHelpTips() {
        document.querySelectorAll('.tc-gen-option-help-wrap').forEach(function (wrap) {
            if (wrap._tcHelpTipBound) return;
            wrap._tcHelpTipBound = true;
            var btn = wrap.querySelector('.tc-gen-option-help-btn');
            var store = wrap.querySelector('.tc-gen-option-hint-store');
            if (!btn || !store) return;

            var floatTip = document.createElement('div');
            floatTip.className = 'tc-gen-option-help-tip';
            floatTip.setAttribute('role', 'tooltip');
            floatTip.style.display = 'none';
            if (store.id) {
                floatTip.id = store.id + '-float';
                btn.setAttribute('aria-describedby', floatTip.id);
            }

            function getTipText() {
                var wrapTip = wrap.getAttribute('data-tip');
                if (wrapTip) return String(wrapTip).trim();
                return String(store.textContent || '').trim();
            }

            function syncWrapDataTip() {
                var text = String(store.textContent || '').trim();
                if (text) wrap.setAttribute('data-tip', text);
            }
            syncWrapDataTip();

            function placeTip() {
                syncWrapDataTip();
                floatTip.textContent = getTipText();
                if (!floatTip.parentElement) document.body.appendChild(floatTip);
                var tipZ = typeof tcWorkbenchModalZIndex === 'function' ? tcWorkbenchModalZIndex() + 1 : 10460;
                floatTip.style.setProperty('z-index', String(tipZ), 'important');
                floatTip.style.display = 'block';
                floatTip.style.visibility = 'hidden';
                floatTip.style.opacity = '0';
                floatTip.style.left = '-9999px';
                floatTip.style.top = '0';
                var width = floatTip.offsetWidth || floatTip.scrollWidth;
                var rect = btn.getBoundingClientRect();
                var left = rect.left + rect.width / 2 - width / 2;
                left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
                floatTip.style.left = left + 'px';
                floatTip.style.top = (rect.bottom + 6) + 'px';
            }

            function showTip() {
                if (!getTipText()) return;
                placeTip();
                floatTip.style.visibility = 'visible';
                floatTip.style.opacity = '1';
                floatTip.classList.add('tc-gen-option-help-tip--open');
            }

            function hideTip() {
                floatTip.classList.remove('tc-gen-option-help-tip--open');
                floatTip.style.display = 'none';
                floatTip.style.visibility = 'hidden';
                floatTip.style.opacity = '0';
                floatTip.style.left = '';
                floatTip.style.top = '';
            }

            wrap.addEventListener('mouseenter', showTip);
            wrap.addEventListener('mouseleave', hideTip);
            btn.addEventListener('mouseenter', showTip);
            btn.addEventListener('mouseleave', hideTip);
            btn.addEventListener('focus', showTip);
            btn.addEventListener('blur', hideTip);
            store.addEventListener('tc-hint-updated', syncWrapDataTip);
        });
    }

    function mountLanhuTooldeckControls() {
        bindGenOptionHelpTips();
        syncGenOptionHelpDataTips();
    }

    function mountBatchBar() {
        mountLanhuTooldeckControls();
        ['tc-validate-drawer-single',
            'tc-validate-float-reopen-btn-agent', 'tc-validate-drawer-agent',
            'tc-agent-drawer',
            'tc-stash-diff-modal', 'tc-adoption-stats-modal', 'tc-mindmap-review-modal'].forEach(function (id) {
            var el = $(id);
            if (el && el.parentElement !== document.body) document.body.appendChild(el);
        });
    }

    function ensureInit() {
        if (!state._inited) init();
    }

    function init() {
        if (state._inited) return;
        if (!document.querySelector('.tc-workbench-scope')) return;
        state._inited = true;
        mountBatchBar();
        bindUi();
        bindAdoptionStatsDelegation();
        bindAdoptDelegation();
        bindMindmapReviewModal();
        wrapDeleteRow();
        wrapSaveEditRow();
        wrapRenderTableBody();
        wrapRenderStashList();
        wrapLanhuSummary();
        syncAuthStatus();
        if (!global._tcEnhAuthNavBound) {
            global._tcEnhAuthNavBound = true;
            global.addEventListener('hf-auth-nav-updated', function (ev) {
                var detail = ev && ev.detail ? ev.detail : {};
                state.loggedIn = !!(detail.authenticated && detail.user);
            });
        }
        if (typeof global.refreshTcStashList === 'function') {
            Promise.resolve(global.refreshTcStashList()).catch(function () {});
        }
        if (!global._tcGenAutoValidatePageshowBound) {
            global._tcGenAutoValidatePageshowBound = true;
            global.addEventListener('pageshow', function (ev) {
                if (!document.querySelector('.tc-workbench-scope')) return;
                if (ev.persisted) resetGenAutoValidateToggleDefault();
            });
        }
    }


    global.TcWorkbenchEnhancements = {
        init: init,
        ensureInit: ensureInit,
        remountLanhuTooldeckControls: mountLanhuTooldeckControls,
        bindBatchBarButtons: bindBatchBarButtons,
        syncBatchStateFromCore: syncBatchStateFromCore,
        collectBatchRowsPayloadForValidation: collectBatchRowsPayloadForValidation,
        isValidateMindmapBatch: isValidateMindmapBatch,
        getValidateBatchSnapshot: getValidateBatchSnapshot,
        extendValidateBatchSnapshot: extendValidateBatchSnapshot,
        captureGenAutoValidateForTask: captureGenAutoValidateForTask,
        shouldRunSingleAutoValidateAfterGeneration: shouldRunSingleAutoValidateAfterGeneration,
        onGenerationSuccess: onGenerationSuccess,
        onBatchClose: onBatchClose,
        acceptAllBatch: acceptAllBatch,
        rejectAllBatch: rejectAllBatch,
        postRowFeedback: postRowFeedback,
        openMindmapReviewModal: openMindmapReviewModal,
        closeMindmapReviewModal: closeMindmapReviewModal,
        syncMindmapReviewBtnVisibility: syncMindmapReviewBtnVisibility,
        ensureMindmapReviewBarBtn: ensureMindmapReviewBarBtn,
        getLastRequirementsSummary: function () {
            return String(state.lastLanhuRequirements || state.lastRequirements || '').trim();
        },
        getCurrentBatchValidationKey: function () {
            return getCurrentBatchValidationKey(VALIDATE_SCOPE_SINGLE);
        },
        getArchivedBatchValidationKey: function () {
            return getArchivedBatchValidationKey(VALIDATE_SCOPE_SINGLE);
        },
        getCachedBatchValidation: getCachedBatchValidation,
        buildTurnScopedValidationKey: buildTurnScopedValidationKey,
        buildBatchValidationKey: buildBatchValidationKey,
        migrateValidationCacheToTurn: migrateValidationCacheToTurn,
        buildBatchMetaForTurnFlush: buildBatchMetaForTurnFlush,
        resolveTurnScopedValidationFallback: resolveTurnScopedValidationFallback,
        attachTurnIdToValidationCache: attachTurnIdToValidationCache,
        persistStaleValidationRun: persistStaleValidationRun,
        resolveTurnIdForPersist: resolveTurnIdForPersist,
        bindPersistTurnIdToSnapshot: bindPersistTurnIdToSnapshot,
        extractTurnIdFromScopedKey: extractTurnIdFromScopedKey,
        persistSessionValidationBeforeLeave: persistSessionValidationBeforeLeave,
        hydrateSessionValidationFromTurns: hydrateSessionValidationFromTurns,
        setLastRequirements: function (text) {
            var val = String(text || '').trim();
            state.lastRequirements = val;
            state.lastLanhuRequirements = val;
        },
        openStashDiff: function () {
            var items = global.HfLocalStash ? HfLocalStash.tc.list().items || [] : [];
            if (items.length) openStashDiffModal(items[0].id, '__current__');
            else alertBox('请先在暂存区保存至少一条快照后再对比。', { title: '暂无快照' });
        },
        runValidation: runValidation,
        isSingleGenValidationInProgress: isSingleGenValidationInProgress,
        runAutoValidationAfterGeneration: runAutoValidationAfterGeneration,
        applyAgentValidationFromJob: applyAgentValidationFromJob,
        refreshValidationIssuesView: refreshValidationIssuesView,
        ensureRequirementsForValidation: ensureRequirementsForValidation,
        ensureRequirementsForSingleLlmValidation: ensureRequirementsForSingleLlmValidation,
        highlightValidateRow: highlightValidateRow,
        resolveTurnIdForValidation: resolveTurnIdForValidation,
        isValidateViewingLatestSessionTurn: isValidateViewingLatestSessionTurn,
        resolveTurnIdForPersistCache: resolveTurnIdForPersistCache,
        flushPendingValidationForTurn: flushPendingValidationForTurn,
        queuePendingValidationFlush: queuePendingValidationFlush,
        openValidateDrawer: openValidateDrawer,
        toggleValidateDrawer: toggleValidateDrawer,
        isValidateDrawerOpen: isValidateDrawerOpen,
        bringFloatPanelToFront: bringTcFloatPanelToFront,
        abortPendingValidation: abortPendingValidation,
        resetValidateTaskState: resetValidateTaskState,
        getFloatPanelStackZIndex: getFloatPanelStackZIndex,
        ensureValidateDrawerCoverageSize: ensureValidateDrawerCoverageSize,
        closeValidateDrawer: closeValidateDrawer,
        syncValidateReopenButtonsLayout: syncValidateReopenButtonsLayout,
        collapseValidateDrawerBeforeAgentPlanningOpen: collapseValidateDrawerBeforeAgentPlanningOpen,
        openAdoptionStatsModal: openAdoptionStatsModal,
        closeAdoptionStatsModal: closeAdoptionStatsModal,
        reloadAdoptionStatsIfOpen: reloadAdoptionStatsIfOpen,
        migrateLocalStatsToServer: migrateLocalStatsToServer,
        openExportReportModal: openExportReportModal,
        shouldHideValidateDetailForSkippedNoLanhu: shouldHideValidateDetailForSkippedNoLanhu,
        shouldSuppressValidateUiForSkippedNoLanhu: shouldSuppressValidateUiForSkippedNoLanhu,
        validationHasActionableResults: validationHasActionableResults,
        getLastValidation: function (scope) {
            var vData = vScopeData(normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE));
            return vData.lastValidation ? JSON.parse(JSON.stringify(vData.lastValidation)) : null;
        },
        getLastExportReport: function () { return lastExportReport; }
    };

    function bootTcEnhancements() {
        bindTcFloatPanelStack();
        bindAdoptionStatsDelegation();
        if (!document.querySelector('.tc-workbench-scope')) return;
        init();
    }
    bindTcFloatPanelStack();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootTcEnhancements);
    } else {
        bootTcEnhancements();
    }
})(window);
