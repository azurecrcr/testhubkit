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
        applyLockUi();
        try {
            window.dispatchEvent(new CustomEvent('tc-page-gen-lock-changed', { detail: { lock: _activeLock } }));
        } catch (e) { /* ignore */ }
    }

    function refreshTcPageGenLock() {
        return apiJson('/api/test-cases/page-gen-lock', { method: 'GET' })
            .then(function (d) {
                if (d.ok) setLock(d.lock || null);
                else setLock(null);
                return _activeLock;
            })
            .catch(function () {
                setLock(null);
                return null;
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

    function wrapOpenTcPageGenModal() {
        if (!window.openTcPageGenModal || window.openTcPageGenModal.__tcLockWrapped) return;
        var orig = window.openTcPageGenModal;
        window.openTcPageGenModal = function (pageId, pageName) {
            refreshTcPageGenLock().then(function () {
                if (_activeLock && _activeLock.status === 'running' && !isSamePage(_activeLock, pageId, _activeLock.lanhu_doc_id)) {
                    var label = _activeLock.page_name || _activeLock.lanhu_page_id || '其他页面';
                    if (typeof tcAppToast === 'function') {
                        tcAppToast('「' + label + '」正在生成用例，请等待完成后再切换页面', { variant: 'warning' });
                    }
                    return;
                }
                return orig.apply(this, arguments);
            });
        };
        window.openTcPageGenModal.__tcLockWrapped = true;
    }

    function startPolling() {
        if (_pollTimer) return;
        _pollTimer = setInterval(refreshTcPageGenLock, POLL_MS);
    }

    function stopPolling() {
        if (!_pollTimer) return;
        clearInterval(_pollTimer);
        _pollTimer = null;
    }

    function onLockChanged() {
        if (_activeLock) startPolling();
        else stopPolling();
    }

    window.buildTcPageGenContext = buildPageGenContext;
    window.checkTcPageGenAllowed = checkPageGenAllowed;
    window.refreshTcPageGenLock = refreshTcPageGenLock;

    window.addEventListener('tc-page-gen-lock-changed', onLockChanged);

    function init() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        wrapOpenTcPageGenModal();
        refreshTcPageGenLock().then(function (lock) {
            if (lock) startPolling();
        });
        setTimeout(wrapOpenTcPageGenModal, 800);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
