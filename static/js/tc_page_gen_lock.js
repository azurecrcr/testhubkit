(function tcPageGenLock() {
    'use strict';

    var POLL_MS = 2500;
    var _pollTimer = null;
    var _activeLock = null;

    function apiJson(url, opts) {
        opts = opts || {};
        opts.credentials = 'same-origin';
        return fetch(url, opts).then(function (r) {
            return r.json().then(function (d) {
                d = d || {};
                if (!r.ok && d.ok !== false) d.ok = false;
                return d;
            });
        }).catch(function (err) {
            if (typeof window.tcIsBenignFetchAbort === 'function' && window.tcIsBenignFetchAbort(err)) {
                return { ok: false, _benignAbort: true };
            }
            return { ok: false, error: String((err && err.message) || err || 'network error') };
        });
    }

    function buildPageGenContext(pageId, pageName, pageUrl) {
        var meta = typeof window.getTcLanhuDocTreeMeta === 'function'
            ? window.getTcLanhuDocTreeMeta() : {};
        return {
            lanhu_page_id: String(pageId || ''),
            page_id: String(pageId || ''),
            page_name: String(pageName || ''),
            lanhu_url: String(pageUrl || ''),
            lanhu_doc_id: String((meta && meta.docId) || ''),
            doc_id: String((meta && meta.docId) || '')
        };
    }

    function isSamePage(lock, pageId, docId) {
        if (!lock || !pageId) return false;
        if (String(lock.lanhu_page_id || '') !== String(pageId)) return false;
        if (docId && lock.lanhu_doc_id && String(lock.lanhu_doc_id) !== String(docId)) return false;
        return true;
    }

    function isPageGenLockActive() {
        return !!(_activeLock && _activeLock.status === 'running');
    }

    function isTcRequirementPageGenBusy() {
        if (isPageGenLockActive()) return true;
        if (typeof window.isTcLeftPanelNavLocked === 'function' && window.isTcLeftPanelNavLocked()) {
            return true;
        }
        if (window.TcGenerationStreamClient &&
            typeof window.TcGenerationStreamClient.isActive === 'function' &&
            window.TcGenerationStreamClient.isActive()) {
            return true;
        }
        return false;
    }

    function setOptimisticPageGenLock(pageId, pageName, pageUrl) {
        var ctx = buildPageGenContext(pageId, pageName, pageUrl);
        setLock({
            status: 'running',
            lanhu_page_id: ctx.lanhu_page_id,
            lanhu_doc_id: ctx.lanhu_doc_id,
            page_name: ctx.page_name || ctx.lanhu_page_id,
            lanhu_url: ctx.lanhu_url,
            session_id: null,
            optimistic: true
        });
    }

    function clearOptimisticPageGenLock() {
        if (_activeLock && _activeLock.optimistic) {
            setLock(null);
        }
    }

    function resolveGeneratingPageId() {
        if (_activeLock && _activeLock.lanhu_page_id) {
            return String(_activeLock.lanhu_page_id);
        }
        if (window.TC_PAGE_GEN_STATE && window.TC_PAGE_GEN_STATE.pageId) {
            return String(window.TC_PAGE_GEN_STATE.pageId);
        }
        if (window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.getGenerationPinnedPageId === 'function') {
            var pinned = window.TcRequirementCaseStore.getGenerationPinnedPageId();
            if (pinned) return String(pinned);
        }
        return '';
    }

    function isPageGenNavigationBlocked(pageId, docId) {
        if (!isTcRequirementPageGenBusy()) return false;
        pageId = String(pageId || '').trim();
        var genPageId = resolveGeneratingPageId();
        if (!genPageId) return !!pageId;
        if (!pageId) return true;
        if (pageId !== genPageId) return true;
        if (_activeLock && docId && _activeLock.lanhu_doc_id &&
            String(_activeLock.lanhu_doc_id) !== String(docId)) {
            return true;
        }
        return false;
    }

    function toastPageGenNavigationBlocked() {
        if (typeof window.toastTcLanhuRequirementPageSwitchBlocked === 'function') {
            window.toastTcLanhuRequirementPageSwitchBlocked();
            return;
        }
        var label = '';
        if (_activeLock) {
            label = _activeLock.page_name || _activeLock.lanhu_page_id || '';
        }
        if (!label && window.TC_PAGE_GEN_STATE && window.TC_PAGE_GEN_STATE.pageName) {
            label = window.TC_PAGE_GEN_STATE.pageName;
        }
        if (!label) label = '当前页面';
        if (typeof tcAppToast === 'function') {
            tcAppToast('「' + label + '」正在生成用例，请等待完成后再切换页面', { variant: 'warning' });
        } else {
            alert('「' + label + '」正在生成用例，请等待完成后再切换页面');
        }
    }

    function resolveCurrentSelectedLanhuPageId() {
        var store = window.TcRequirementCaseStore;
        if (store && typeof store.getActiveLanhuPageId === 'function') {
            var activeId = String(store.getActiveLanhuPageId() || '').trim();
            if (activeId) return activeId;
        }
        if (typeof window.getTcLanhuDocTreeMeta === 'function') {
            var meta = window.getTcLanhuDocTreeMeta() || {};
            var selId = String(meta.selectedId || meta.focusPageId || '').trim();
            if (selId) return selId;
        }
        var selectedRow = document.querySelector('#tc-lanhu-tree-mount li[data-tree-type="page"] .tc-lanhu-tree-node--selected [data-tree-select]');
        if (selectedRow) {
            return String(selectedRow.getAttribute('data-tree-select') || '').trim();
        }
        return '';
    }

    function bindPageGenTreeNavGuard() {
        var rail = document.getElementById('tc-lanhu-doc-tree-rail');
        if (!rail || rail.dataset.tcPageGenNavGuard === '1') return;
        rail.dataset.tcPageGenNavGuard = '1';
        rail.addEventListener('click', function (ev) {
            if (ev.target.closest('[data-tree-gen]') ||
                ev.target.closest('[data-tree-refresh]') ||
                ev.target.closest('[data-tree-toggle]')) {
                return;
            }
            var selectRow = ev.target.closest('[data-tree-select]');
            if (!selectRow) return;
            var sid = selectRow.getAttribute('data-tree-select');
            if (!sid) return;
            var selLi = selectRow.closest('li[data-tree-type]');
            if (!selLi || selLi.getAttribute('data-tree-type') !== 'page') return;
            if (!(isPageGenNavigationBlocked(sid) ||
                (typeof window.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
                    window.isTcLanhuRequirementPageSwitchBlocked() &&
                    sid !== resolveCurrentSelectedLanhuPageId()))) return;
            ev.preventDefault();
            ev.stopPropagation();
            toastPageGenNavigationBlocked();
        }, true);
    }

    function wrapRequirementPageNavigation() {
        var store = window.TcRequirementCaseStore;
        if (!store || store.__pageGenNavWrapped) return;
        var origSwitch = store.switchRequirementPage;
        if (typeof origSwitch === 'function') {
            store.switchRequirementPage = function (pageId, pageName, opts) {
                if (isPageGenNavigationBlocked(pageId) ||
                    (typeof window.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
                        window.isTcLanhuRequirementPageSwitchBlocked() &&
                        String(pageId || '').trim() &&
                        String(pageId || '').trim() !== resolveCurrentSelectedLanhuPageId())) {
                    toastPageGenNavigationBlocked();
                    return Promise.resolve(false);
                }
                return origSwitch.call(store, pageId, pageName, opts).catch(function (err) {
                    if (typeof window.tcIsBenignFetchAbort === 'function' && window.tcIsBenignFetchAbort(err)) {
                        return false;
                    }
                    return Promise.reject(err);
                });
            };
        }
        var origOnPage = store.onPageSelected;
        if (typeof origOnPage === 'function') {
            store.onPageSelected = function (pageId, pageName, opts) {
                if (isPageGenNavigationBlocked(pageId) ||
                    (typeof window.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
                        window.isTcLanhuRequirementPageSwitchBlocked() &&
                        String(pageId || '').trim() &&
                        String(pageId || '').trim() !== resolveCurrentSelectedLanhuPageId())) {
                    toastPageGenNavigationBlocked();
                    return Promise.resolve(false);
                }
                return origOnPage.call(store, pageId, pageName, opts).catch(function (err) {
                    if (typeof window.tcIsBenignFetchAbort === 'function' && window.tcIsBenignFetchAbort(err)) {
                        return false;
                    }
                    return Promise.reject(err);
                });
            };
        }
        var origHydrate = store.hydrateSelectedPageCases;
        if (typeof origHydrate === 'function') {
            store.hydrateSelectedPageCases = function (pageId, pageName, opts) {
                if (isPageGenNavigationBlocked(pageId) ||
                    (typeof window.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
                        window.isTcLanhuRequirementPageSwitchBlocked() &&
                        String(pageId || '').trim() &&
                        String(pageId || '').trim() !== resolveCurrentSelectedLanhuPageId())) {
                    toastPageGenNavigationBlocked();
                    return Promise.resolve(false);
                }
                return origHydrate.call(store, pageId, pageName, opts).catch(function (err) {
                    if (typeof window.tcIsBenignFetchAbort === 'function' && window.tcIsBenignFetchAbort(err)) {
                        return false;
                    }
                    return Promise.reject(err);
                });
            };
        }
        store.__pageGenNavWrapped = true;
    }

    function applyLockUi() {
        var lock = _activeLock;
        var running = !!(lock && lock.status === 'running');
        document.querySelectorAll('.tc-lanhu-tree-node__gen').forEach(function (btn) {
            var pageId = btn.getAttribute('data-tree-gen') || '';
            var blocked = running && !isSamePage(lock, pageId, lock.lanhu_doc_id);
            btn.disabled = blocked;
            btn.classList.toggle('tc-lanhu-tree-node__gen--locked', blocked);
            if (blocked) {
                btn.title = '「' + (lock.page_name || lock.lanhu_page_id || '其他页面') + '」正在生成，请等待完成';
            }
        });
        var trigger = document.getElementById('tc-lanhu-doc-switcher-trigger');
        if (trigger) trigger.classList.toggle('tc-page-gen-lock-active', running);
    }

    function setLock(lock) {
        _activeLock = lock && lock.status === 'running' ? lock : null;
        window.__tcPageGenLock = _activeLock;
        if (_activeLock && window.TcCoverageMatrix &&
            typeof window.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal === 'function') {
            window.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal();
        }
        applyLockUi();
        try {
            window.dispatchEvent(new CustomEvent('tc-page-gen-lock-changed', { detail: { lock: _activeLock } }));
        } catch (e) { /* ignore */ }
    }

    function isGenerationStreamActive() {
        return !!(window.TcGenerationStreamClient &&
            typeof window.TcGenerationStreamClient.isActive === 'function' &&
            window.TcGenerationStreamClient.isActive());
    }

    function shouldKeepOptimisticLockWithoutServer() {
        if (!_activeLock || !_activeLock.optimistic) return false;
        return isGenerationStreamActive();
    }

    function applyRefreshLockResponse(d) {
        if (d && d.ok && d.lock) {
            setLock(d.lock);
            return _activeLock;
        }
        if (!shouldKeepOptimisticLockWithoutServer()) {
            setLock(null);
        }
        return _activeLock;
    }

    function refreshTcPageGenLock() {
        return apiJson('/api/test-cases/page-gen-lock', { method: 'GET' })
            .then(applyRefreshLockResponse)
            .catch(function () {
                if (!shouldKeepOptimisticLockWithoutServer()) setLock(null);
                return _activeLock;
            });
    }

    function checkPageGenAllowed(pageId, pageName, pageUrl) {
        var ctx = buildPageGenContext(pageId, pageName, pageUrl);
        return apiJson('/api/test-cases/page-gen-lock/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ctx)
        }).then(function (d) {
            if (d.allowed !== false) return true;
            if (typeof tcAppToast === 'function') {
                tcAppToast(d.message || '当前有页面正在生成，请等待完成', { variant: 'warning' });
            } else {
                alert(d.message || '当前有页面正在生成，请等待完成');
            }
            if (d.lock) setLock(d.lock);
            return false;
        }).catch(function () { return true; });
    }


    function hookGenerationLockReleaseOnStreamIdle() {
        if (window.__tcPageGenLockStreamIdleHooked) return;
        window.__tcPageGenLockStreamIdleHooked = true;
        setInterval(function () {
            if (!_activeLock) return;
            if (isGenerationStreamActive()) return;
            refreshTcPageGenLock().catch(function () { /* ignore */ });
        }, 1500);
    }

    function wrapOpenTcPageGenModal() {
        if (!window.openTcPageGenModal || window.openTcPageGenModal.__tcLockWrapped) return;
        var orig = window.openTcPageGenModal;
        window.openTcPageGenModal = function (pageId, pageName) {
            var pid = pageId;
            var pname = pageName;
            refreshTcPageGenLock().then(function () {
                if (_activeLock && _activeLock.status === 'running') {
                    var label = _activeLock.page_name || _activeLock.lanhu_page_id || '当前页面';
                    if (isSamePage(_activeLock, pid, _activeLock.lanhu_doc_id)) {
                        if (typeof tcAppToast === 'function') {
                            tcAppToast('「' + label + '」正在生成用例，请等待完成', { variant: 'warning' });
                        } else {
                            alert('「' + label + '」正在生成用例，请等待完成');
                        }
                        return;
                    }
                    if (typeof tcAppToast === 'function') {
                        tcAppToast('「' + label + '」正在生成用例，请等待完成后再切换页面', { variant: 'warning' });
                    } else {
                        alert('「' + label + '」正在生成用例，请等待完成后再切换页面');
                    }
                    return;
                }
                return orig.call(this, pid, pname);
            }).catch(function () { /* ignore modal lock refresh */ });
        };
        window.openTcPageGenModal.__tcLockWrapped = true;
    }

    function startPolling() {
        if (_pollTimer) return;
        _pollTimer = setInterval(function () { refreshTcPageGenLock().catch(function () { /* ignore */ }); }, POLL_MS);
    }

    function stopPolling() {
        if (!_pollTimer) return;
        clearInterval(_pollTimer);
        _pollTimer = null;
    }

    function onLockChanged() {
        if (_activeLock) startPolling();
        else stopPolling();
        if (typeof window.tcSyncLanhuNavLockUiAfterGenerationIdle === 'function') {
            window.tcSyncLanhuNavLockUiAfterGenerationIdle();
        } else if (typeof window.tcSyncLanhuDocSwitcherLockUi === 'function') {
            window.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    window.buildTcPageGenContext = buildPageGenContext;
    window.checkTcPageGenAllowed = checkPageGenAllowed;
    window.refreshTcPageGenLock = refreshTcPageGenLock;
    window.isTcPageGenLockActive = isPageGenLockActive;
    window.isTcPageGenNavigationBlocked = isPageGenNavigationBlocked;
    window.toastTcPageGenNavigationBlocked = toastPageGenNavigationBlocked;
    window.setOptimisticPageGenLock = setOptimisticPageGenLock;
    window.clearOptimisticPageGenLock = clearOptimisticPageGenLock;
    window.isTcRequirementPageGenBusy = isTcRequirementPageGenBusy;
    if (typeof window.isTcWorkbenchGenerationActive !== 'function') {
        window.isTcWorkbenchGenerationActive = isTcRequirementPageGenBusy;
    } else {
        var _origIsTcWorkbenchGenerationActive = window.isTcWorkbenchGenerationActive;
        window.isTcWorkbenchGenerationActive = function () {
            return isTcRequirementPageGenBusy() || _origIsTcWorkbenchGenerationActive();
        };
    }

    window.addEventListener('tc-page-gen-lock-changed', onLockChanged);

    function init() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        wrapOpenTcPageGenModal();
        bindPageGenTreeNavGuard();
        hookGenerationLockReleaseOnStreamIdle();
        refreshTcPageGenLock().then(function (lock) {
            if (lock) startPolling();
        });
        setTimeout(function () {
            wrapOpenTcPageGenModal();
            wrapRequirementPageNavigation();
            bindPageGenTreeNavGuard();
        }, 800);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
