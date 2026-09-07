(function tcExportXmindPicker(global) {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var tcExportXmindPickerItems = [];
    var tcExportXmindPickerSelectionOrder = [];
    var tcExportXmindPickerCurrentKey = '';

    function buildXmindExportKey(item) {
        item = item || {};
        return [
            String(item.lanhu_url || '').trim(),
            String(item.lanhu_page_id || item.page_id || '').trim()
        ].join('|');
    }

    function resolveXmindExportActiveDocId() {
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            return String((global.getTcLanhuDocTreeMeta() || {}).docId || '').trim();
        }
        return '';
    }

    function filterXmindExportItemsForActiveDoc(items) {
        items = items || [];
        var activeDocId = resolveXmindExportActiveDocId();
        if (!activeDocId) return items;
        return items.filter(function (item) {
            return String(item.lanhu_doc_id || '').trim() === activeDocId;
        });
    }

    function resolveCurrentMindmapExportContext() {
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.resolveContext === 'function') {
            return global.TcRequirementCaseStore.resolveContext({});
        }
        return null;
    }

    function resolvePageFullPathForXmindExport(item) {
        item = item || {};
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (pageId && typeof global.findTcLanhuPageNodePath === 'function') {
            var path = String(global.findTcLanhuPageNodePath(pageId) || '').trim();
            if (path) return path;
        }
        return String(item.page_name || item.requirement_id || '未命名需求').trim() || '未命名需求';
    }

    function resolveLanhuDocDisplayNameForXmindExport() {
        var nameInput = $('tc-lanhu-connect-doc-name');
        if (nameInput && String(nameInput.value || '').trim()) {
            return String(nameInput.value || '').trim();
        }
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            if (String(meta.docName || '').trim()) return String(meta.docName).trim();
        }
        var titleEl = $('tc-lanhu-tree-doc-title');
        var title = titleEl ? String(titleEl.textContent || '').trim() : '';
        if (title && title !== '蓝湖需求树' && title !== '蓝湖需求') return title;
        if (typeof global.getTcLanhuActiveSavedDocName === 'function') {
            var saved = String(global.getTcLanhuActiveSavedDocName() || '').trim();
            if (saved) return saved;
        }
        return '需求文档';
    }

    function mindmapPayloadHasExportableContent(payload) {
        if (!payload || typeof payload !== 'object') return false;
        var mind = payload.mind;
        if (mind && mind.data) {
            var ch = mind.data.children;
            if (Array.isArray(ch) && ch.length) return true;
        }
        var rows = payload.rows;
        if (Array.isArray(rows) && rows.length) {
            return rows.some(function (row) {
                if (!Array.isArray(row)) return false;
                return row.some(function (cell) { return String(cell != null ? cell : '').trim(); });
            });
        }
        return false;
    }

    function buildMindRootNodeFromPayload(payload) {
        payload = payload || {};
        if (payload.mind && payload.mind.data) {
            try {
                return JSON.parse(JSON.stringify(payload.mind.data));
            } catch (eClone) { /* fallback below */ }
        }
        if (typeof global.buildTcMindmapMindData !== 'function') return null;
        var savedCases = global.tcMindmapCasesData;
        var savedCols = global.tableColumns;
        var savedRoot = global.tcMindmapRootTopic;
        var savedApplied = global.tcTableTemplateApplied;
        try {
            global.tableColumns = (payload.columns || []).map(function (c) { return String(c); });
            global.tcMindmapCasesData = (payload.rows || []).map(function (row) {
                return Array.isArray(row) ? row.map(function (v) { return String(v != null ? v : ''); }) : [];
            });
            global.tcTableTemplateApplied = true;
            if (payload.rootTopic) global.tcMindmapRootTopic = String(payload.rootTopic);
            var built = global.buildTcMindmapMindData();
            return built && built.data ? built.data : null;
        } finally {
            global.tcMindmapCasesData = savedCases;
            global.tableColumns = savedCols;
            global.tcMindmapRootTopic = savedRoot;
            global.tcTableTemplateApplied = savedApplied;
        }
    }

    function mindRootChildrenToXmindTopics(mindRoot) {
        if (!mindRoot || typeof global.tcJsmindNodeToXmindTopic !== 'function') return [];
        var children = mindRoot.children || [];
        if (!children.length) {
            var single = global.tcJsmindNodeToXmindTopic(mindRoot);
            if (!single) return [];
            delete single.children;
            return [single];
        }
        if (typeof global.tcJsmindNodeToXmindZenTopic === 'function') {
            return children.map(global.tcJsmindNodeToXmindZenTopic).filter(Boolean);
        }
        return children.map(global.tcJsmindNodeToXmindTopic).filter(Boolean);
    }

    function downloadXmindBlob(rootTopic, filenameStem, sheetTitle) {
        if (!rootTopic) return false;
        if (typeof global.tcDownloadXmindZenBlob === 'function') {
            return global.tcDownloadXmindZenBlob(rootTopic, filenameStem, { sheetTitle: sheetTitle || '测试用例' });
        }
        if (typeof global.tcBuildXmindZenWorkbookBlob !== 'function') return false;
        var blob = global.tcBuildXmindZenWorkbookBlob(rootTopic, { sheetTitle: sheetTitle || '测试用例' });
        if (!blob) return false;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (filenameStem || '测试用例') + '_' + new Date().toISOString().slice(0, 10) + '.xmind';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }

    function collectLiveMindmapPayloadForCurrentPage() {
        if (typeof global.collectTcMindmapStashPayload === 'function') {
            try {
                var payload = global.collectTcMindmapStashPayload();
                if (mindmapPayloadHasExportableContent(payload)) return payload;
            } catch (eLive) { /* ignore */ }
        }
        if (global.tcMindmapInstance && typeof global.tcMindmapInstance.get_data === 'function') {
            try {
                var mindData = global.tcMindmapInstance.get_data('node_tree');
                if (mindData && mindData.data) {
                    return { mind: mindData, columns: global.tableColumns || [], rows: global.tcMindmapCasesData || [] };
                }
            } catch (eInst) { /* ignore */ }
        }
        if (typeof global.buildTcMindmapMindData === 'function') {
            var built = global.buildTcMindmapMindData();
            if (built && built.data) {
                return { mind: built, columns: global.tableColumns || [], rows: global.tcMindmapCasesData || [] };
            }
        }
        return null;
    }

    function isCurrentMindmapExportItem(item) {
        var ctx = resolveCurrentMindmapExportContext();
        if (!ctx || !item) return false;
        return buildXmindExportKey(ctx) === buildXmindExportKey(item);
    }

    function fetchMindmapPayloadForExportItem(item) {
        if (isCurrentMindmapExportItem(item)) {
            var live = collectLiveMindmapPayloadForCurrentPage();
            if (live) return Promise.resolve(live);
        }
        var lanhuUrl = String(item.lanhu_url || '').trim();
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (!lanhuUrl || !pageId) return Promise.resolve(null);
        var q = '/api/test-cases/requirement-mindmaps?lanhu_url=' +
            encodeURIComponent(lanhuUrl) + '&page_id=' + encodeURIComponent(pageId) + '&_ts=' + Date.now();
        return fetch(q, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d || !d.ok || !d.found || !d.data || !d.data.payload) return null;
                return d.data.payload;
            })
            .catch(function () { return null; });
    }

    function mergeCurrentPageIntoMindmapExportList(items) {
        items = (items || []).slice();
        var ctx = resolveCurrentMindmapExportContext();
        if (!ctx) return items;
        var activeDocId = resolveXmindExportActiveDocId();
        if (activeDocId && String(ctx.lanhu_doc_id || '').trim() !== activeDocId) return items;
        var live = collectLiveMindmapPayloadForCurrentPage();
        if (!mindmapPayloadHasExportableContent(live)) return items;
        var key = buildXmindExportKey(ctx);
        var pageName = String(ctx.page_name || '').trim() || '未命名需求';
        var caseCount = Array.isArray(live.rows) ? live.rows.length : 0;
        var found = false;
        for (var i = 0; i < items.length; i++) {
            if (buildXmindExportKey(items[i]) === key) {
                items[i] = Object.assign({}, items[i], {
                    page_name: pageName || items[i].page_name,
                    case_count: Math.max(parseInt(items[i].case_count, 10) || 0, caseCount),
                    is_current: true
                });
                found = true;
                break;
            }
        }
        if (!found) {
            items.unshift({
                requirement_id: ctx.requirement_id || ctx.lanhu_page_id || '',
                lanhu_pid: ctx.lanhu_pid || '',
                lanhu_doc_id: ctx.lanhu_doc_id || '',
                lanhu_page_id: ctx.lanhu_page_id || ctx.page_id || '',
                lanhu_url: ctx.lanhu_url || '',
                page_name: pageName,
                case_count: caseCount,
                updated_at: '',
                is_current: true
            });
        }
        return items;
    }

    function fetchDesignedMindmapList() {
        return fetch('/api/test-cases/requirement-mindmaps/list', { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.ok) throw new Error((data && data.error) || '加载思维导图列表失败');
                return mergeCurrentPageIntoMindmapExportList(
                    filterXmindExportItemsForActiveDoc(data.items || [])
                );
            });
    }

    function ensureExportXmindPickerMounted() {
        if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') {
            global.ensureTcWorkbenchOverlaysMounted();
        }
        var modal = $('tc-export-xmind-modal');
        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        return modal;
    }

    function closeTcExportXmindPickerModal() {
        var modal = $('tc-export-xmind-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('#tc-export-xmind-modal.flex')) {
            document.body.style.overflow = '';
        }
    }

    function getSelectedXmindExportItems() {
        var selected = [];
        (tcExportXmindPickerSelectionOrder || []).forEach(function (idx) {
            if (tcExportXmindPickerItems[idx]) selected.push(tcExportXmindPickerItems[idx]);
        });
        return selected;
    }

    function syncXmindExportOrderBadges() {
        var orderMap = {};
        (tcExportXmindPickerSelectionOrder || []).forEach(function (idx, order) {
            orderMap[idx] = order + 1;
        });
        document.querySelectorAll('#tc-export-xmind-list .tc-export-xmind-check').forEach(function (el) {
            var idx = parseInt(el.getAttribute('data-index'), 10);
            var badge = el.closest('.tc-export-xmind-item');
            if (!badge) return;
            var orderEl = badge.querySelector('.tc-export-xmind-item__order');
            if (!orderEl) return;
            var n = orderMap[idx];
            if (n) {
                orderEl.textContent = String(n);
                orderEl.classList.remove('hidden');
            } else {
                orderEl.textContent = '';
                orderEl.classList.add('hidden');
            }
        });
    }

    function updateTcExportXmindPickerSummary() {
        var summary = $('tc-export-xmind-summary');
        var submit = $('tc-export-xmind-submit');
        var selected = getSelectedXmindExportItems();
        var count = selected.length;
        var cases = 0;
        selected.forEach(function (item) {
            cases += parseInt(item.case_count, 10) || 0;
        });
        if (summary) {
            summary.textContent = count
                ? ('已选 ' + count + ' 个需求页，共约 ' + cases + ' 条导图用例（按勾选顺序导出）')
                : '请勾选需要导出的需求页';
        }
        if (submit) {
            submit.disabled = count === 0;
            submit.textContent = count > 1 ? '导出合并 XMind' : '导出 XMind';
        }
        syncXmindExportOrderBadges();
    }

    function onTcExportXmindCheckChange(ev) {
        var el = ev.target;
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (isNaN(idx)) return;
        if (el.checked) {
            if (tcExportXmindPickerSelectionOrder.indexOf(idx) < 0) {
                tcExportXmindPickerSelectionOrder.push(idx);
            }
        } else {
            tcExportXmindPickerSelectionOrder = tcExportXmindPickerSelectionOrder.filter(function (i) { return i !== idx; });
        }
        updateTcExportXmindPickerSummary();
    }

    function renderTcExportXmindPickerList(items) {
        tcExportXmindPickerItems = items || [];
        var listEl = $('tc-export-xmind-list');
        var emptyEl = $('tc-export-xmind-empty');
        var loadingEl = $('tc-export-xmind-loading');
        if (loadingEl) loadingEl.classList.add('hidden');
        if (!listEl) return;
        if (!items.length) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            updateTcExportXmindPickerSummary();
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        listEl.innerHTML = items.map(function (item, idx) {
            var name = String(item.page_name || item.requirement_id || '未命名需求').trim();
            var meta = (parseInt(item.case_count, 10) || 0) + ' 条导图用例';
            if (item.is_current) meta += ' · 当前页面';
            var pagePath = resolvePageFullPathForXmindExport(item);
            var pathHtml = pagePath
                ? ('<span class="tc-export-xmind-item__path" title="' + esc(pagePath) + '">' + esc(pagePath) + '</span>')
                : '';
            var checked = item.is_current || buildXmindExportKey(item) === tcExportXmindPickerCurrentKey;
            return '<label class="tc-export-xmind-item">' +
                '<input type="checkbox" class="tc-export-xmind-check" data-index="' + idx + '"' + (checked ? ' checked' : '') + '>' +
                '<span class="tc-export-xmind-item__order hidden" aria-hidden="true"></span>' +
                '<span class="tc-export-xmind-item__body">' +
                '<span class="tc-export-xmind-item__head">' +
                '<span class="tc-export-xmind-item__title">' + esc(name) + '</span>' +
                pathHtml +
                '</span>' +
                '<span class="tc-export-xmind-item__meta">' + esc(meta) + '</span>' +
                '</span></label>';
        }).join('');
        tcExportXmindPickerSelectionOrder = [];
        items.forEach(function (item, idx) {
            if (item.is_current || buildXmindExportKey(item) === tcExportXmindPickerCurrentKey) {
                tcExportXmindPickerSelectionOrder.push(idx);
            }
        });
        listEl.querySelectorAll('.tc-export-xmind-check').forEach(function (el) {
            el.addEventListener('change', onTcExportXmindCheckChange);
        });
        updateTcExportXmindPickerSummary();
    }

    function exportTcMindmapMultiToXmind(selectedItems) {
        var docName = resolveLanhuDocDisplayNameForXmindExport();
        return Promise.all(selectedItems.map(function (item) {
            return fetchMindmapPayloadForExportItem(item).then(function (payload) {
                return { item: item, payload: payload };
            });
        })).then(function (results) {
            var pageTopics = [];
            var errors = [];
            results.forEach(function (result) {
                var item = result.item;
                var payload = result.payload;
                if (!mindmapPayloadHasExportableContent(payload)) {
                    errors.push(resolvePageFullPathForXmindExport(item) + '：无可导出的导图用例');
                    return;
                }
                var mindRoot = buildMindRootNodeFromPayload(payload);
                var attached = mindRootChildrenToXmindTopics(mindRoot);
                if (!attached.length) {
                    errors.push(resolvePageFullPathForXmindExport(item) + '：导图结构为空');
                    return;
                }
                pageTopics.push({
                    id: 'page_' + String(item.lanhu_page_id || item.page_id || pageTopics.length),
                    title: resolvePageFullPathForXmindExport(item),
                    children: { attached: attached }
                });
            });
            if (!pageTopics.length) {
                throw new Error(errors.length ? errors.join('\n') : '没有可导出的导图用例');
            }
            var rootTopic = {
                id: 'doc_' + Date.now(),
                title: docName,
                children: { attached: pageTopics }
            };
            if (!downloadXmindBlob(rootTopic, docName.replace(/[\\/:*?"<>|]/g, '_'), docName)) {
                throw new Error('生成 XMind 文件失败');
            }
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('已导出合并 XMind 文件（' + pageTopics.length + ' 个需求页）', {
                    variant: 'success',
                    duration: 3200
                });
            }
            if (errors.length && typeof global.tcAppToast === 'function') {
                global.tcAppToast('部分页面跳过：' + errors.join('；'), { variant: 'warning', duration: 5200 });
            }
        });
    }

    function syncBeforeXmindExport() {
        if (global.TcRequirementMindmapStore && typeof global.TcRequirementMindmapStore.persistNow === 'function') {
            return Promise.resolve(global.TcRequirementMindmapStore.persistNow('manual_edit', {})).catch(function () {});
        }
        return Promise.resolve();
    }

    function runExportForSelectedXmindPages(selectedItems) {
        if (!selectedItems.length) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert('请至少选择一个需求页。', { variant: 'info', title: '请选择需求页' });
            }
            return;
        }
        closeTcExportXmindPickerModal();
        syncBeforeXmindExport().then(function () {
            if (selectedItems.length === 1 && isCurrentMindmapExportItem(selectedItems[0])) {
                if (typeof global.exportTcMindmapToXmind === 'function') {
                    global.exportTcMindmapToXmind();
                    return;
                }
            }
            if (selectedItems.length === 1) {
                return fetchMindmapPayloadForExportItem(selectedItems[0]).then(function (payload) {
                    if (!mindmapPayloadHasExportableContent(payload)) {
                        throw new Error('该需求页暂无可导出的导图用例');
                    }
                    var mindRoot = buildMindRootNodeFromPayload(payload);
                    var rootTopic = typeof global.tcJsmindNodeToXmindZenTopic === 'function'
                        ? global.tcJsmindNodeToXmindZenTopic(mindRoot)
                        : (typeof global.tcJsmindNodeToXmindTopic === 'function' ? global.tcJsmindNodeToXmindTopic(mindRoot) : null);
                    if (!rootTopic) throw new Error('无法读取思维导图结构');
                    if (!downloadXmindBlob(rootTopic, '测试用例')) {
                        throw new Error('生成 XMind 文件失败');
                    }
                    if (typeof global.tcAppToast === 'function') {
                        global.tcAppToast('已导出 XMind 文件，可用 XMind / Zen 打开。', {
                            variant: 'success',
                            duration: 3200
                        });
                    }
                });
            }
            return exportTcMindmapMultiToXmind(selectedItems);
        }).catch(function (err) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert((err && err.message) || '导出失败', { variant: 'warning', title: '导出失败' });
            }
        });
    }

    function openTcExportXmindPickerModal() {
        if (typeof global.ensureTcTableTemplateApplied === 'function' && !global.ensureTcTableTemplateApplied()) {
            return;
        }
        var modal = ensureExportXmindPickerMounted();
        if (!modal) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert('导出弹窗未就绪，请刷新页面后重试。', { variant: 'warning', title: '导出失败' });
            }
            return;
        }
        var ctx = resolveCurrentMindmapExportContext();
        tcExportXmindPickerCurrentKey = ctx ? buildXmindExportKey(ctx) : '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        var loadingEl = $('tc-export-xmind-loading');
        var listEl = $('tc-export-xmind-list');
        var emptyEl = $('tc-export-xmind-empty');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.add('hidden');
        fetchDesignedMindmapList()
            .then(renderTcExportXmindPickerList)
            .catch(function (err) {
                if (loadingEl) loadingEl.classList.add('hidden');
                if (typeof global.tcAppAlert === 'function') {
                    global.tcAppAlert((err && err.message) || '加载失败', { variant: 'warning', title: '导出失败' });
                }
                closeTcExportXmindPickerModal();
            });
    }

    function initTcExportXmindPickerUi() {
        if (global._tcExportXmindPickerInited) return;
        global._tcExportXmindPickerInited = true;
        $('tc-export-xmind-close') && $('tc-export-xmind-close').addEventListener('click', closeTcExportXmindPickerModal);
        $('tc-export-xmind-cancel') && $('tc-export-xmind-cancel').addEventListener('click', closeTcExportXmindPickerModal);
        $('tc-export-xmind-select-all') && $('tc-export-xmind-select-all').addEventListener('click', function () {
            tcExportXmindPickerSelectionOrder = tcExportXmindPickerItems.map(function (_, idx) { return idx; });
            document.querySelectorAll('.tc-export-xmind-check').forEach(function (el) { el.checked = true; });
            updateTcExportXmindPickerSummary();
        });
        $('tc-export-xmind-select-none') && $('tc-export-xmind-select-none').addEventListener('click', function () {
            tcExportXmindPickerSelectionOrder = [];
            document.querySelectorAll('.tc-export-xmind-check').forEach(function (el) { el.checked = false; });
            updateTcExportXmindPickerSummary();
        });
        $('tc-export-xmind-submit') && $('tc-export-xmind-submit').addEventListener('click', function () {
            runExportForSelectedXmindPages(getSelectedXmindExportItems());
        });
        $('tc-export-xmind-modal') && $('tc-export-xmind-modal').addEventListener('click', function (e) {
            if (e.target === $('tc-export-xmind-modal')) closeTcExportXmindPickerModal();
        });
    }

    initTcExportXmindPickerUi();
    global.openTcExportXmindPickerModal = openTcExportXmindPickerModal;
    global.exportTcMindmapMultiToXmind = exportTcMindmapMultiToXmind;
})(typeof window !== 'undefined' ? window : globalThis);
