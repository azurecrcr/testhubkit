/**
 * 用例评审 · 多需求页选择（隔离模块，不影响导出与其它分享逻辑）
 */
(function (global) {
    'use strict';

    if (global._tcShareRequirementPickerModule) return;

    var tcShareRequirementPickerItems = [];
    var tcShareRequirementPickerSelectionOrder = [];
    var tcShareRequirementPickerCurrentKey = '';
    var tcShareRequirementPickerCallback = null;

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function alertBox(msg, opts) {
        if (typeof global.tcAppAlert === 'function') {
            global.tcAppAlert(msg, opts || { variant: 'warning', title: '提示' });
        } else {
            global.alert(msg);
        }
    }

    function buildRequirementShareKey(item) {
        if (!item) return '';
        return [
            String(item.lanhu_pid || ''),
            String(item.lanhu_doc_id || ''),
            String(item.lanhu_page_id || item.page_id || '')
        ].join(':');
    }

    function formatRequirementShareUpdatedAt(raw) {
        var text = String(raw || '').trim();
        if (!text) return '';
        return text.replace('T', ' ').slice(0, 16);
    }

    function resolveCurrentRequirementShareContext() {
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.resolveContext === 'function') {
            return global.TcRequirementCaseStore.resolveContext({});
        }
        return null;
    }

    function sharePayloadHasRowContent(payload) {
        if (!payload || !payload.columns || !payload.columns.length) return false;
        var rows = payload.rows || [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i] || [];
            for (var j = 0; j < row.length; j++) {
                if (String(row[j] != null ? row[j] : '').trim()) return true;
            }
        }
        return false;
    }

    function countLiveShareableRowsForPicker() {
        if (typeof global.tcCollectLiveSharePayload !== 'function') return 0;
        var payload = global.tcCollectLiveSharePayload();
        if (!sharePayloadHasRowContent(payload)) return 0;
        return (payload.rows || []).length;
    }

    function mergeCurrentPageIntoShareRequirementList(items) {
        items = (items || []).slice();
        var ctx = resolveCurrentRequirementShareContext();
        if (!ctx) return items;
        var liveCount = countLiveShareableRowsForPicker();
        if (!liveCount) return items;
        var key = buildRequirementShareKey(ctx);
        var pageName = String(ctx.page_name || '').trim() || '未命名需求';
        for (var i = 0; i < items.length; i++) {
            if (buildRequirementShareKey(items[i]) === key) {
                items[i] = Object.assign({}, items[i], {
                    page_name: pageName || items[i].page_name,
                    row_count: liveCount,
                    is_current: true,
                    review_case_kind: 'table'
                });
                return items;
            }
        }
        items.unshift({
            review_case_kind: 'table',
            requirement_id: ctx.requirement_id || ctx.lanhu_page_id || '',
            lanhu_pid: ctx.lanhu_pid || '',
            lanhu_doc_id: ctx.lanhu_doc_id || '',
            lanhu_page_id: ctx.lanhu_page_id || ctx.page_id || '',
            lanhu_url: ctx.lanhu_url || '',
            page_name: pageName,
            row_count: liveCount,
            updated_at: '',
            is_current: true
        });
        return items;
    }


    function getShareReviewCaseTabModule() {
        return global.TcShareReviewCaseTabs || null;
    }

    function getShareReviewActiveCaseTab() {
        var mod = getShareReviewCaseTabModule();
        return mod ? mod.getActiveTab() : 'table';
    }

    function prefetchShareReviewCaseTabItems(tab) {
        var mod = getShareReviewCaseTabModule();
        if (!mod) return;
        var ctx = resolveCurrentRequirementShareContext();
        if (tab === mod.TAB_MINDMAP) {
            if (mod.isMindmapListLoaded() || mod.isMindmapListLoading()) return;
            mod.setMindmapListLoading(true);
            mod.fetchMindmapList(ctx, buildRequirementShareKey)
                .then(function (items) {
                    mod.setItems(mod.TAB_MINDMAP, items);
                    mod.setMindmapListLoaded(true);
                })
                .catch(function () {
                    mod.setItems(mod.TAB_MINDMAP, []);
                    mod.setMindmapListLoaded(true);
                })
                .finally(function () { mod.setMindmapListLoading(false); });
            return;
        }
        if (mod.isTableListLoaded() || mod.isTableListLoading()) return;
        mod.setTableListLoading(true);
        fetchDesignedShareRequirementList(ctx)
            .then(function (items) {
                mod.setItems(mod.TAB_TABLE, items);
                mod.setTableListLoaded(true);
            })
            .catch(function () {
                mod.setItems(mod.TAB_TABLE, []);
                mod.setTableListLoaded(true);
            })
            .finally(function () { mod.setTableListLoading(false); });
    }

    function loadShareReviewCaseTabItems(tab, onDone) {
        var mod = getShareReviewCaseTabModule();
        tab = mod ? (tab === mod.TAB_MINDMAP ? mod.TAB_MINDMAP : mod.TAB_TABLE) : 'table';
        var ctx = resolveCurrentRequirementShareContext();
        var activeTab = mod ? mod.getActiveTab() : tab;
        var shouldRender = tab === activeTab;

        function finishRender(items) {
            if (shouldRender) renderShareRequirementPickerList(items);
            if (onDone) onDone();
        }

        if (tab === mod.TAB_MINDMAP && mod) {
            if (mod.isMindmapListLoaded()) {
                finishRender(mod.getItems(tab));
                return;
            }
            if (mod.isMindmapListLoading()) return;
            mod.setMindmapListLoading(true);
            if (shouldRender) setShareRequirementPickerLoading(true);
            mod.fetchMindmapList(ctx, buildRequirementShareKey)
                .then(function (items) {
                    mod.setItems(tab, items);
                    mod.setMindmapListLoaded(true);
                    finishRender(items);
                })
                .catch(function (err) {
                    mod.setItems(tab, []);
                    mod.setMindmapListLoaded(true);
                    if (shouldRender) {
                        renderShareRequirementPickerList([]);
                        alertBox((err && err.message) || '加载导图用例列表失败', { variant: 'warning', title: '加载失败' });
                    }
                })
                .finally(function () {
                    mod.setMindmapListLoading(false);
                });
            return;
        }
        if (mod && mod.isTableListLoaded()) {
            finishRender(mod.getItems(mod.TAB_TABLE));
            return;
        }
        if (mod && mod.isTableListLoading()) return;
        if (mod) mod.setTableListLoading(true);
        if (shouldRender) setShareRequirementPickerLoading(true);
        fetchDesignedShareRequirementList(ctx)
            .then(function (items) {
                if (mod) {
                    mod.setItems(mod.TAB_TABLE, items);
                    mod.setTableListLoaded(true);
                }
                finishRender(items);
            })
            .catch(function (err) {
                if (mod) {
                    mod.setItems(mod.TAB_TABLE, []);
                    mod.setTableListLoaded(true);
                }
                if (shouldRender) {
                    renderShareRequirementPickerList([]);
                    alertBox((err && err.message) || '加载需求列表失败', { variant: 'warning', title: '加载失败' });
                }
            })
            .finally(function () {
                if (mod) mod.setTableListLoading(false);
            });
    }

    function switchShareReviewCaseTab(tab) {
        var mod = getShareReviewCaseTabModule();
        if (!mod) return;
        mod.persistCurrentSelection(tcShareRequirementPickerSelectionOrder.slice());
        mod.setActiveTab(tab);
        if (tab === mod.TAB_MINDMAP && !mod.isMindmapListLoaded()) {
            loadShareReviewCaseTabItems(tab);
            return;
        }
        if (tab === mod.TAB_TABLE && !mod.isTableListLoaded()) {
            loadShareReviewCaseTabItems(tab);
            return;
        }
        renderShareRequirementPickerList(mod.getItems(tab));
    }


    function buildShareReviewRequirementListQuery(ctx) {
        ctx = ctx || resolveCurrentRequirementShareContext();
        if (!ctx) return '';
        var docId = String(ctx.lanhu_doc_id || '').trim();
        if (!docId) return '';
        var q = '?lanhu_doc_id=' + encodeURIComponent(docId);
        var pid = String(ctx.lanhu_pid || '').trim();
        if (pid) q += '&lanhu_pid=' + encodeURIComponent(pid);
        return q;
    }

    function fetchDesignedShareRequirementList(ctx) {
        ctx = ctx || resolveCurrentRequirementShareContext();
        return fetch('/api/test-cases/requirement-cases/list' + buildShareReviewRequirementListQuery(ctx), { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.ok) {
                    throw new Error((data && data.error) || '加载需求列表失败');
                }
                return mergeCurrentPageIntoShareRequirementList((data.items || []).map(function (it) {
                    return Object.assign({}, it, { review_case_kind: 'table' });
                }));
            });
    }

    function mountShareRequirementPickerModal() {
        var modal = $('tc-share-requirement-modal');
        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        return modal;
    }

    function closeShareRequirementPickerModal() {
        if (global.TcShareWorkbench && typeof global.TcShareWorkbench.closeUnifiedReviewModal === 'function') {
            global.TcShareWorkbench.closeUnifiedReviewModal();
            return;
        }
        var modal = $('tc-share-requirement-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.classList.remove('tc-share-review-modal--settings-only');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.tc-share-modal.flex')) {
            document.body.style.overflow = '';
        }
    }

    function onShareRequirementCheckChange(e) {
        var el = e && e.target;
        if (!el) return;
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (isNaN(idx)) return;
        if (el.checked) {
            if (tcShareRequirementPickerSelectionOrder.indexOf(idx) === -1) {
                tcShareRequirementPickerSelectionOrder.push(idx);
            }
        } else {
            tcShareRequirementPickerSelectionOrder = tcShareRequirementPickerSelectionOrder.filter(function (i) {
                return i !== idx;
            });
        }
        var mod = getShareReviewCaseTabModule();
        if (mod) mod.persistCurrentSelection(tcShareRequirementPickerSelectionOrder.slice());
        updateShareRequirementPickerSummary();
    }

    function getShareRequirementPickerListEl() {
        return $('tc-share-requirement-list');
    }

    function getSelectedShareRequirementItems() {
        var listEl = getShareRequirementPickerListEl();
        var selected = [];
        var seen = {};
        tcShareRequirementPickerSelectionOrder.forEach(function (idx) {
            var item = tcShareRequirementPickerItems[idx];
            if (!item || seen[idx]) return;
            var el = listEl
                ? listEl.querySelector('.tc-share-requirement-check[data-index="' + idx + '"]')
                : document.querySelector('.tc-share-requirement-check[data-index="' + idx + '"]');
            if (!el || !el.checked) return;
            seen[idx] = true;
            selected.push(item);
        });
        var checkedEls = listEl
            ? listEl.querySelectorAll('.tc-share-requirement-check:checked')
            : document.querySelectorAll('.tc-share-requirement-check:checked');
        checkedEls.forEach(function (el) {
            var idx = parseInt(el.getAttribute('data-index'), 10);
            if (isNaN(idx) || seen[idx] || !tcShareRequirementPickerItems[idx]) return;
            seen[idx] = true;
            selected.push(tcShareRequirementPickerItems[idx]);
        });
        return selected;
    }

    function syncShareReviewSuggestedTitle(selected) {
        var titleEl = $('tc-share-create-title');
        if (!titleEl || titleEl.dataset.userEdited === '1') return;
        titleEl.value = buildShareReviewSuggestedTitle(selected) || '';
    }

    function resetShareReviewModalForm() {
        var titleEl = $('tc-share-create-title');
        var expiresEl = $('tc-share-create-expires');
        var commentsEl = $('tc-share-create-comments');
        if (titleEl) {
            titleEl.value = '';
            delete titleEl.dataset.userEdited;
        }
        if (expiresEl) expiresEl.value = '30';
        if (commentsEl) commentsEl.checked = true;
    }

    function bindShareReviewTitleInputOnce() {
        if (global._tcShareReviewTitleBound) return;
        global._tcShareReviewTitleBound = true;
        var titleEl = $('tc-share-create-title');
        if (!titleEl) return;
        titleEl.addEventListener('input', function () {
            titleEl.dataset.userEdited = '1';
        });
    }

    function updateShareRequirementPickerSummary() {
        var summary = $('tc-share-requirement-summary');
        var submit = $('tc-share-requirement-submit');
        var selected = getSelectedShareRequirementItems();
        var count = selected.length;
        var rows = 0;
        selected.forEach(function (item) {
            rows += parseInt(item.row_count, 10) || 0;
        });
        if (summary) {
            summary.textContent = count
                ? ('已选 ' + count + ' · 约 ' + rows + ' 条')
                : '请勾选需求';
        }
        if (submit) submit.disabled = count === 0;
        syncShareReviewSuggestedTitle(selected);
        syncShareRequirementPickerOrderBadges();
    }

    function syncShareRequirementPickerOrderBadges() {
        document.querySelectorAll('.tc-share-requirement-item').forEach(function (label) {
            var badge = label.querySelector('.tc-share-requirement-item__order');
            if (!badge) return;
            badge.textContent = '';
            badge.classList.add('hidden');
        });
        var listEl = getShareRequirementPickerListEl();
        tcShareRequirementPickerSelectionOrder.forEach(function (idx, order) {
            var el = listEl
                ? listEl.querySelector('.tc-share-requirement-check[data-index="' + idx + '"]')
                : document.querySelector('.tc-share-requirement-check[data-index="' + idx + '"]');
            if (!el || !el.checked) return;
            var label = el.closest('.tc-share-requirement-item');
            if (!label) return;
            var badge = label.querySelector('.tc-share-requirement-item__order');
            if (!badge) return;
            badge.textContent = String(order + 1);
            badge.classList.remove('hidden');
        });
    }

    function renderShareRequirementPickerList(items) {
        items = items || [];
        var mod = getShareReviewCaseTabModule();
        var tab = getShareReviewActiveCaseTab();
        if (mod) {
            mod.setItems(tab, items);
            tcShareRequirementPickerSelectionOrder = mod.getSelection(tab).slice();
        }
        tcShareRequirementPickerItems = items;
        var listEl = $('tc-share-requirement-list');
        var emptyEl = $('tc-share-requirement-empty');
        var loadingEl = $('tc-share-requirement-loading');
        if (loadingEl) loadingEl.classList.add('hidden');
        if (!listEl) return;
        if (!items.length) {
            listEl.innerHTML = '';
            if (emptyEl) {
                emptyEl.classList.remove('hidden');
                var modEmpty = getShareReviewCaseTabModule();
                emptyEl.textContent = modEmpty ? modEmpty.emptyText(tab) : '暂无可选需求';
            }
            updateShareRequirementPickerSummary();
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        tcShareRequirementPickerSelectionOrder = [];
        items.forEach(function (item, idx) {
            if (item.is_current || buildRequirementShareKey(item) === tcShareRequirementPickerCurrentKey) {
                tcShareRequirementPickerSelectionOrder.push(idx);
            }
        });
        listEl.innerHTML = items.map(function (item, idx) {
            var name = String(item.page_name || item.requirement_id || '未命名需求').trim();
            var modMeta = getShareReviewCaseTabModule();
            var metaSuffix = modMeta ? modMeta.itemMetaSuffix(tab) : ' 条用例';
            var meta = (parseInt(item.row_count, 10) || parseInt(item.case_count, 10) || 0) + metaSuffix;
            var updated = formatRequirementShareUpdatedAt(item.updated_at);
            if (updated) meta += ' · 更新 ' + updated;
            if (item.is_current) meta += ' · 当前页面';
            var checked = item.is_current || buildRequirementShareKey(item) === tcShareRequirementPickerCurrentKey;
            var pagePath = '';
            if (modMeta && typeof modMeta.resolveShareRequirementPageFullPath === 'function') {
                pagePath = String(modMeta.resolveShareRequirementPageFullPath(item) || '').trim();
            } else if (typeof global.findTcLanhuPageNodePath === 'function') {
                var pid = String(item.lanhu_page_id || item.page_id || '').trim();
                pagePath = pid ? String(global.findTcLanhuPageNodePath(pid) || '').trim() : '';
            }
            var pathHtml = pagePath
                ? ('<span class="tc-share-requirement-item__path" title="' + esc(pagePath) + '">' + esc(pagePath) + '</span>')
                : '';
            return '<label class="tc-share-requirement-item">' +
                '<input type="checkbox" class="tc-share-requirement-check" data-index="' + idx + '"' +
                (checked ? ' checked' : '') + '>' +
                '<span class="tc-share-requirement-item__order hidden" aria-hidden="true"></span>' +
                '<span class="tc-share-requirement-item__body">' +
                '<span class="tc-share-requirement-item__head">' +
                '<span class="tc-share-requirement-item__title">' + esc(name) + '</span>' +
                pathHtml +
                '</span>' +
                '<span class="tc-share-requirement-item__meta">' + esc(meta) + '</span>' +
                '</span></label>';
        }).join('');
        listEl.querySelectorAll('.tc-share-requirement-check').forEach(function (el) {
            el.addEventListener('change', onShareRequirementCheckChange);
        });
        updateShareRequirementPickerSummary();
    }

    function setShareRequirementPickerLoading(isLoading) {
        var loadingEl = $('tc-share-requirement-loading');
        var listEl = $('tc-share-requirement-list');
        var emptyEl = $('tc-share-requirement-empty');
        if (loadingEl) loadingEl.classList.toggle('hidden', !isLoading);
        if (isLoading) {
            if (listEl) listEl.innerHTML = '';
            if (emptyEl) emptyEl.classList.add('hidden');
        }
    }

    function fetchRequirementCaseDoc(item) {
        var lanhuUrl = String(item.lanhu_url || '').trim();
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (!lanhuUrl || !pageId) {
            return Promise.reject(new Error('需求链接不完整'));
        }
        var url = '/api/test-cases/requirement-cases?lanhu_url=' +
            encodeURIComponent(lanhuUrl) + '&page_id=' + encodeURIComponent(pageId);
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.ok || !data.found || !data.data) {
                    throw new Error('未找到用例数据');
                }
                return data.data;
            });
    }

    function docToSharePayload(doc) {
        var raw = doc.payload || {};
        var columns = (raw.columns || []).map(function (c) { return String(c); });
        var n = columns.length;
        if (!n) return null;
        var rows = (raw.rows || []).map(function (row) {
            var out = [];
            for (var i = 0; i < n; i++) {
                out.push(String(row[i] != null ? row[i] : ''));
            }
            return out;
        });
        var prov = raw.provenance;
        if (!Array.isArray(prov) || prov.length !== rows.length) {
            prov = rows.map(function () { return null; });
        }
        var payload = {
            scope: 'table',
            template_id: doc.template_id || null,
            template_name: null,
            columns: columns,
            rows: rows,
            provenance: prov,
            columnVisible: raw.columnVisible || {},
            columnWidth: raw.columnWidth || {},
            rowHeights: raw.rowHeights || {}
        };
        if (typeof global.tcEnrichSharePayloadTemplate === 'function') {
            global.tcEnrichSharePayloadTemplate(payload);
        }
        return payload;
    }

    function getLiveSharePayloadForRequirementItem(item) {
        if (typeof global.tcCollectLiveSharePayload !== 'function') {
            return Promise.reject(new Error('当前页面暂无可评审用例'));
        }
        var payload = global.tcCollectLiveSharePayload();
        if (!sharePayloadHasRowContent(payload)) {
            return Promise.reject(new Error('当前页面暂无可评审用例'));
        }
        return Promise.resolve({ sharePayload: payload, page_name: item.page_name });
    }

    function resolveRequirementSharePayload(item) {
        if (item && item.review_case_kind === 'mindmap') {
            var mod = getShareReviewCaseTabModule();
            if (mod && typeof mod.resolveMindmapSharePayload === 'function') {
                return mod.resolveMindmapSharePayload(item, {
                    resolveCtx: resolveCurrentRequirementShareContext,
                    buildKey: buildRequirementShareKey,
                    sharePayloadHasRowContent: sharePayloadHasRowContent
                });
            }
        }
        var ctx = resolveCurrentRequirementShareContext();
        var isCurrent = item.is_current || (ctx && buildRequirementShareKey(item) === buildRequirementShareKey(ctx));
        if (isCurrent && countLiveShareableRowsForPicker() > 0) {
            return getLiveSharePayloadForRequirementItem(item);
        }
        return fetchRequirementCaseDoc(item).then(function (doc) {
            var sharePayload = docToSharePayload(doc);
            if (!sharePayload || !sharePayloadHasRowContent(sharePayload)) {
                throw new Error('没有可评审的有效用例');
            }
            return { sharePayload: sharePayload, page_name: doc.page_name || item.page_name };
        });
    }

    function findShareColumnIndex(columns, name) {
        var target = String(name || '').trim().toLowerCase();
        for (var i = 0; i < (columns || []).length; i++) {
            if (String(columns[i] || '').trim().toLowerCase() === target) return i;
        }
        return null;
    }

    function remapShareRowsToTargetColumns(targetColumns, sourceColumns, sourceRows) {
        return (sourceRows || []).map(function (row) {
            return (targetColumns || []).map(function (colName) {
                var si = findShareColumnIndex(sourceColumns, colName);
                if (si == null || si >= (row || []).length) return '';
                var cell = row[si];
                return cell === null || cell === undefined ? '' : String(cell);
            });
        });
    }

    function mergeSharePayloadsInSelectionOrder(payloads) {
        payloads = payloads || [];
        if (!payloads.length) return null;
        if (payloads.length === 1) return payloads[0];
        var base = payloads[0];
        var merged = {
            scope: 'table',
            template_id: base.template_id,
            template_name: base.template_name,
            columns: base.columns.slice(),
            rows: base.rows.slice(),
            provenance: (base.provenance || []).slice(),
            columnVisible: Object.assign({}, base.columnVisible || {}),
            columnWidth: Object.assign({}, base.columnWidth || {}),
            rowHeights: Object.assign({}, base.rowHeights || {})
        };
        for (var i = 1; i < payloads.length; i++) {
            var p = payloads[i];
            var remapped = remapShareRowsToTargetColumns(merged.columns, p.columns, p.rows);
            merged.rows = merged.rows.concat(remapped);
            var prov = p.provenance || [];
            for (var j = 0; j < remapped.length; j++) {
                merged.provenance.push(prov[j] || null);
            }
        }
        if (merged.provenance.length !== merged.rows.length) {
            merged.provenance = merged.rows.map(function (_, idx) {
                return merged.provenance[idx] || null;
            });
        }
        if (typeof global.tcEnrichSharePayloadTemplate === 'function') {
            global.tcEnrichSharePayloadTemplate(merged);
        }
        return merged;
    }

    function buildShareReviewSuggestedTitle(items) {
        if (!items || !items.length) return '';
        if (items.length === 1) {
            var one = String(items[0].page_name || '').trim();
            return one ? one + ' 评审' : '用例评审';
        }
        return '多需求评审（' + items.length + ' 页）';
    }

    function syncBeforeShareReview() {
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.flushIfDirty === 'function') {
            return Promise.resolve(global.TcRequirementCaseStore.flushIfDirty('share_review')).catch(function () {});
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return Promise.resolve(global.TcTableBridge.commitAll()).catch(function () {});
        }
        return Promise.resolve();
    }

    function runShareReviewForSelectedRequirements(selectedItems) {
        if (!selectedItems.length) {
            alertBox('请至少选择一个需求页。', { variant: 'info', title: '请选择需求' });
            return;
        }
        var submit = $('tc-share-requirement-submit');
        if (submit) submit.disabled = true;

        syncBeforeShareReview().then(function () {
            return Promise.all(selectedItems.map(function (item) {
                return resolveRequirementSharePayload(item).catch(function (err) {
                    return { error: err, item: item };
                });
            }));
        }).then(function (results) {
            var payloads = [];
            var errors = [];
            results.forEach(function (result) {
                if (!result) return;
                if (result.error) {
                    errors.push(String(result.item && result.item.page_name || '需求') + '：' +
                        (result.error.message || '加载失败'));
                    return;
                }
                if (result.sharePayload) payloads.push(result.sharePayload);
            });
            if (!payloads.length) {
                alertBox(errors.length ? errors.join('\n') : '没有可评审的有效用例。', {
                    variant: 'warning',
                    title: '无法创建评审'
                });
                return;
            }
            var modMerge = getShareReviewCaseTabModule();
            var useMindmapMerge = selectedItems.length && selectedItems.every(function (it) {
                return it && it.review_case_kind === 'mindmap';
            });
            if (useMindmapMerge && modMerge && typeof modMerge.mergeMindmapSharePayloads === 'function') {
                modMerge._remapRows = remapShareRowsToTargetColumns;
            }
            var merged = useMindmapMerge && modMerge
                ? modMerge.mergeMindmapSharePayloads(payloads)
                : mergeSharePayloadsInSelectionOrder(payloads);
            if (!merged || !sharePayloadHasRowContent(merged)) {
                alertBox('合并后没有可评审的有效用例。', { variant: 'warning', title: '无法创建评审' });
                return;
            }
            if (errors.length && typeof global.tcAppToast === 'function') {
                global.tcAppToast('部分需求页加载失败：' + errors.join('；'), {
                    variant: 'warning',
                    duration: 5200
                });
            }
            var pageMetaList = [];
            results.forEach(function (result, idx) {
                if (!result || result.error || !result.sharePayload) return;
                pageMetaList.push({ item: selectedItems[idx], payload: result.sharePayload, page_name: result.page_name });
            });
            var cb = tcShareRequirementPickerCallback;
            tcShareRequirementPickerCallback = null;
            if (global.TcShareWorkbench && typeof global.TcShareWorkbench.submitUnifiedReview === 'function') {
                return global.TcShareWorkbench.submitUnifiedReview({
                    payload: merged,
                    selectedItems: selectedItems,
                    pageMetaList: useMindmapMerge ? pageMetaList : null,
                    suggestedTitle: buildShareReviewSuggestedTitle(selectedItems)
                });
            }
            if (cb) {
                cb({
                    payload: merged,
                    suggestedTitle: buildShareReviewSuggestedTitle(selectedItems),
                    selectedItems: selectedItems
                });
            }
        }).catch(function (err) {
            alertBox('加载用例失败：' + (err && err.message ? err.message : '未知错误'), {
                variant: 'warning',
                title: '无法创建评审'
            });
        }).finally(function () {
            if (submit) submit.disabled = getSelectedShareRequirementItems().length === 0;
        });
    }

    function openShareRequirementPickerModal(opts) {
        opts = opts || {};
        var modal = mountShareRequirementPickerModal();
        if (!modal) {
            alertBox('评审弹窗未就绪，请刷新页面后重试。', { variant: 'warning', title: '无法打开' });
            return;
        }
        bindShareReviewTitleInputOnce();
        resetShareReviewModalForm();
        modal.classList.toggle('tc-share-review-modal--settings-only', !!opts.settingsOnly);
        if (opts.title) {
            var titleEl = $('tc-share-create-title');
            if (titleEl) {
                titleEl.value = String(opts.title);
                titleEl.dataset.userEdited = '1';
            }
        }
        var ctx = resolveCurrentRequirementShareContext();
        tcShareRequirementPickerCurrentKey = ctx ? buildRequirementShareKey(ctx) : '';
        tcShareRequirementPickerSelectionOrder = [];
        var modOpen = getShareReviewCaseTabModule();
        if (modOpen) {
            modOpen.bindTabsOnce(switchShareReviewCaseTab);
            modOpen.resetForModalOpen(modOpen.defaultTabForView());
            modOpen.setTabsVisible(!opts.settingsOnly);
        }
        if (opts.settingsOnly) {
            setShareRequirementPickerLoading(false);
            if ($('tc-share-requirement-list')) $('tc-share-requirement-list').innerHTML = '';
            if ($('tc-share-requirement-empty')) $('tc-share-requirement-empty').classList.add('hidden');
            if ($('tc-share-requirement-loading')) $('tc-share-requirement-loading').classList.add('hidden');
            if (modOpen) modOpen.setTabsVisible(false);
            var submitOnly = $('tc-share-requirement-submit');
            if (submitOnly) submitOnly.disabled = false;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            return;
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        loadShareReviewCaseTabItems(modOpen ? modOpen.getActiveTab() : 'table', function () {
            if (!modOpen) return;
            var other = modOpen.getActiveTab() === modOpen.TAB_MINDMAP ? modOpen.TAB_TABLE : modOpen.TAB_MINDMAP;
            prefetchShareReviewCaseTabItems(other);
        });
    }

    function tcOpenShareRequirementPicker(onConfirm) {
        tcShareRequirementPickerCallback = typeof onConfirm === 'function' ? onConfirm : null;
        openShareRequirementPickerModal();
    }

    function tcOpenShareReviewModal(opts) {
        tcShareRequirementPickerCallback = null;
        openShareRequirementPickerModal(opts || {});
    }

    function initShareRequirementPickerUi() {
        if (global._tcShareRequirementPickerInited) return;
        global._tcShareRequirementPickerInited = true;
        var closeFn = function () {
            tcShareRequirementPickerCallback = null;
            closeShareRequirementPickerModal();
        };
        $('tc-share-requirement-close') && $('tc-share-requirement-close').addEventListener('click', closeFn);
        $('tc-share-requirement-cancel') && $('tc-share-requirement-cancel').addEventListener('click', closeFn);
        $('tc-share-requirement-select-all') && $('tc-share-requirement-select-all').addEventListener('click', function () {
            tcShareRequirementPickerSelectionOrder = tcShareRequirementPickerItems.map(function (_, idx) { return idx; });
            document.querySelectorAll('.tc-share-requirement-check').forEach(function (el) { el.checked = true; });
            updateShareRequirementPickerSummary();
        });
        $('tc-share-requirement-select-none') && $('tc-share-requirement-select-none').addEventListener('click', function () {
            tcShareRequirementPickerSelectionOrder = [];
            document.querySelectorAll('.tc-share-requirement-check').forEach(function (el) { el.checked = false; });
            updateShareRequirementPickerSummary();
        });
        $('tc-share-requirement-submit') && $('tc-share-requirement-submit').addEventListener('click', function () {
            var modal = $('tc-share-requirement-modal');
            if (modal && modal.classList.contains('tc-share-review-modal--settings-only')) {
                if (global.TcShareWorkbench && typeof global.TcShareWorkbench.submitUnifiedReview === 'function') {
                    global.TcShareWorkbench.submitUnifiedReview({ payload: null });
                }
                return;
            }
            runShareReviewForSelectedRequirements(getSelectedShareRequirementItems());
        });
        $('tc-share-requirement-modal') && $('tc-share-requirement-modal').addEventListener('click', function (e) {
            if (e.target === $('tc-share-requirement-modal')) closeFn();
        });
    }

    initShareRequirementPickerUi();
    global.tcOpenShareRequirementPicker = tcOpenShareRequirementPicker;
    global.tcOpenShareReviewModal = tcOpenShareReviewModal;
    global._tcShareRequirementPickerModule = true;
})(typeof window !== 'undefined' ? window : this);
