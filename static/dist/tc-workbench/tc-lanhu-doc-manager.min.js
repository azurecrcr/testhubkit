(function tcLanhuDocManager() {
    'use strict';

    var DOCS_KEY = 'tc_lanhu_docs_v2';
    var DOCS_MIGRATED_KEY = 'tc_lanhu_docs_v2_migrated';
    var _docsCache = [];
    var _serverMode = false;
    var _docsReady = false;
    var _lanhuDocQuotaAdmin = false;
    var LANHU_DOC_MAX = 3;
    var _docQuota = { max: 3, count: 0, canAdd: true, isUnlimited: false };
    var LANHU_DOC_QUOTA_MSG = '每位用户最多只能添加三个需求文档。您当前已达上限，如需添加新文档请先删除现有文档。\n\n注意：删除需求文档后，该文档下的所有用例都会丢失，请务必先导出用例后再删除。';

    function loadLocalDocs() {
        try { var r = localStorage.getItem(DOCS_KEY); return r ? JSON.parse(r) : []; }
        catch (e) { return []; }
    }
    function saveLocalDocs(d) {
        try { localStorage.setItem(DOCS_KEY, JSON.stringify(d || [])); } catch (e) {}
    }
    function genId() { return 'd' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

    var DUPLICATE_MSG = '该蓝湖文档已添加，请勿重复添加';

    function normalizeLanhuDocUrlForSave(url) {
        var raw = String(url || '').trim();
        if (!raw) return '';
        return raw
            .replace(/([?&])pageId=[^&]*/gi, '$1')
            .replace(/([?&])page_id=[^&]*/gi, '$1')
            .replace(/[?&]$/, '')
            .replace(/\?&/g, '?')
            .replace(/&&+/g, '&');
    }

    function mergeDocIntoCache(doc) {
        if (!doc) return;
        var docKey = getDocKey(doc);
        var normUrl = normalizeLanhuDocUrlForSave(doc.url || '');
        _docsCache = _docsCache.filter(function(item) {
            if (item.id === doc.id) return false;
            if (docKey && getDocKey(item) === docKey) return false;
            if (normUrl && normalizeLanhuDocUrlForSave(item.url || '') === normUrl) return false;
            return true;
        });
        _docsCache.unshift(doc);
        renderDocList();
    }

    function scheduleConnectAutoDocSave(delayMs) {
        if (window._tcSuppressConnectAutoDocSave) return;
        window.setTimeout(function() {
            if (window._tcSuppressConnectAutoDocSave) return;
            var s = document.getElementById('tc-lanhu-tree-status');
            if (s && s.classList.contains('tc-lanhu-tree-status--ok')) saveCurrentAsDoc({ auto: true });
        }, delayMs || 500);
    }

    function extractLanhuDocKey(url) {
        var raw = normalizeLanhuDocUrlForSave(url);
        if (!raw) return '';
        var qs = raw;
        var hashIdx = raw.indexOf('#');
        if (hashIdx >= 0) {
            var frag = raw.slice(hashIdx + 1);
            qs = frag.indexOf('?') >= 0 ? frag.split('?').slice(1).join('?') : frag;
        } else if (raw.indexOf('?') >= 0) {
            qs = raw.split('?').slice(1).join('?');
        }
        var params = {};
        qs.split('&').forEach(function(part) {
            if (!part || part.indexOf('=') < 0) return;
            var kv = part.split('=');
            try {
                params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
            } catch (e) {
                params[kv[0]] = kv[1] || '';
            }
        });
        var docId = params.docId || params.image_id || '';
        var pid = params.pid || '';
        if (docId) return 'doc:' + docId;
        if (pid) return 'pid:' + pid;
        return 'url:' + raw;
    }

    function getDocKey(doc) {
        if (!doc) return '';
        return doc.lanhuDocKey || extractLanhuDocKey(doc.url);
    }

    function findDuplicateDoc(url, excludeId) {
        var norm = normalizeLanhuDocUrlForSave(url);
        var key = extractLanhuDocKey(norm);
        if (!key) return null;
        var docs = loadDocs();
        for (var i = 0; i < docs.length; i++) {
            var d = docs[i];
            if (excludeId && d.id === excludeId) continue;
            if (getDocKey(d) === key) return d;
            if (norm && normalizeLanhuDocUrlForSave(d.url || '') === norm) return d;
        }
        if (key.indexOf('doc:') === 0) {
            var pidMatch = norm.match(/[?&]pid=([^&]+)/i);
            if (pidMatch) {
                var pidKey = 'pid:' + decodeURIComponent(pidMatch[1]);
                for (var j = 0; j < docs.length; j++) {
                    var item = docs[j];
                    if (excludeId && item.id === excludeId) continue;
                    if (getDocKey(item) === pidKey) return item;
                }
            }
        }
        return null;
    }

    function applyDocQuotaFromResponse(d) {
        if (!d || !d.quota) return;
        var q = d.quota;
        _docQuota = {
            max: q.max != null ? q.max : LANHU_DOC_MAX,
            count: typeof q.count === 'number' ? q.count : loadDocs().length,
            canAdd: q.can_add !== false,
            isUnlimited: !!q.is_unlimited
        };
    }

    function validateLanhuDocUrlForSave(url) {
        var v = window.TcLanhuDocUrlValidator;
        if (v && typeof v.isValid === 'function') return v.isValid(url);
        return /^https:\/\/lanhuapp\.com/i.test(String(url || '').trim());
    }

    function toastInvalidLanhuDocUrl() {
        var msg = (window.TcLanhuDocUrlValidator && window.TcLanhuDocUrlValidator.message) || '文档 URL 须以 https://lanhuapp.com 开头';
        if (typeof tcAppToast === 'function') tcAppToast(msg, { variant: 'warning', duration: 3200 });
        else alert(msg);
    }

    function warnDuplicateDoc() {
        if (window.TcLanhuDocNotice && typeof window.TcLanhuDocNotice.showDuplicate === 'function') {
            window.TcLanhuDocNotice.showDuplicate();
            return;
        }
        if (typeof tcAppToast === 'function') tcAppToast(DUPLICATE_MSG, { variant: 'warning' });
    }

    function handleLanhuDocServerError(err) {
        var code = err && err.code;
        if (code === 'lanhu_doc_duplicate') { warnDuplicateDoc(); return true; }
        if (code === 'lanhu_doc_quota_exceeded') { showLanhuDocQuotaBlockedAlert(); return true; }
        return false;
    }


    function getSavedDocUrlForLanhuDocId(lanhuDocId) {
        lanhuDocId = String(lanhuDocId || '').trim();
        if (!lanhuDocId) return '';
        var key = 'doc:' + lanhuDocId;
        var docs = loadDocs();
        for (var i = 0; i < docs.length; i++) {
            if (getDocKey(docs[i]) === key) {
                return normalizeLanhuDocUrlForSave(docs[i].url || '');
            }
        }
        return '';
    }

    function loadDocs() {
        return _serverMode ? _docsCache.slice() : loadLocalDocs();
    }

    function apiJson(url, opts) {
        opts = opts || {};
        opts.credentials = 'same-origin';
        if (opts.body && typeof opts.body !== 'string') {
            opts.headers = opts.headers || {};
            if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(url, opts).then(function(r) {
            return r.json().then(function(d) {
                d = d || {};
                if (!r.ok && d.ok !== false) d.ok = false;
                if (!r.ok && !d.error) d.error = '请求失败 (' + r.status + ')';
                return d;
            });
        });
    }

    function setDocsCache(docs) {
        _docsCache = Array.isArray(docs) ? docs.slice() : [];
    }

    function migrateLocalToServer() {
        if (!_serverMode) return Promise.resolve();
        var migrated = false;
        try { migrated = localStorage.getItem(DOCS_MIGRATED_KEY) === '1'; } catch (e) {}
        var local = loadLocalDocs();
        if (migrated || !local.length) return Promise.resolve();
        return apiJson('/api/user-lanhu-docs/import-local', {
            method: 'POST',
            body: { docs: local }
        }).then(function(d) {
            if (d.ok) {
                setDocsCache(d.docs || []);
                try {
                    localStorage.removeItem(DOCS_KEY);
                    localStorage.setItem(DOCS_MIGRATED_KEY, '1');
                } catch (e) {}
            }
        }).catch(function() {});
    }

    function refreshDocsFromServer() {
        return apiJson('/api/user-lanhu-docs', { method: 'GET' })
            .then(function(d) {
                if (d.ok) {
                    _serverMode = true;
                    setDocsCache(d.docs || []);
                    applyDocQuotaFromResponse(d);
                    return migrateLocalToServer().then(function() {
                        if (_docsCache.length) return Promise.resolve();
                        return apiJson('/api/user-lanhu-docs', { method: 'GET' }).then(function(d2) {
                            if (d2.ok) {
                                setDocsCache(d2.docs || []);
                                applyDocQuotaFromResponse(d2);
                            }
                        });
                    });
                }
                _serverMode = false;
            })
            .catch(function() { _serverMode = false; })
            .then(function() { _docsReady = true; renderDocList(); });
    }

    function refreshLanhuDocQuotaAuth() {
        return apiJson('/api/auth/me', { method: 'GET' }).then(function(me) {
            _lanhuDocQuotaAdmin = !!(me && me.can_manage_builtin_ai);
        }).catch(function() {
            _lanhuDocQuotaAdmin = false;
        });
    }

    function shouldBlockLanhuDocAdd() {
        if (_lanhuDocQuotaAdmin || _docQuota.isUnlimited) return false;
        if (_serverMode && typeof _docQuota.canAdd === 'boolean') return !_docQuota.canAdd;
        return loadDocs().length >= LANHU_DOC_MAX;
    }

    function showLanhuDocQuotaBlockedAlert() {
        if (window.TcLanhuDocNotice && typeof window.TcLanhuDocNotice.showQuota === 'function') {
            window.TcLanhuDocNotice.showQuota({ count: _docQuota.count, max: _docQuota.max || LANHU_DOC_MAX });
            return;
        }
        if (typeof tcAppAlert === 'function') {
            tcAppAlert(LANHU_DOC_QUOTA_MSG, { title: '无法添加需求文档', variant: 'warning' });
            return;
        }
        alert(LANHU_DOC_QUOTA_MSG);
    }

    function persistDocsLocal(docs) {
        saveLocalDocs(docs);
        renderDocList();
    }

    function upsertDocOnServer(payload) {
        return apiJson('/api/user-lanhu-docs/upsert', {
            method: 'POST',
            body: payload
        }).then(function(d) {
            if (!d.ok) {
                var e = new Error(d.error || '保存失败');
                e.code = d.code;
                throw e;
            }
            mergeDocIntoCache(d.doc);
            applyDocQuotaFromResponse({ quota: { count: loadDocs().length, max: _docQuota.max, can_add: _docQuota.canAdd, is_unlimited: _docQuota.isUnlimited } });
            return d.doc;
        });
    }

    function createDocOnServer(payload) {
        return apiJson('/api/user-lanhu-docs', {
            method: 'POST',
            body: payload
        }).then(function(d) {
            if (!d.ok) {
                var e = new Error(d.error || '添加失败');
                e.code = d.code;
                throw e;
            }
            mergeDocIntoCache(d.doc);
            applyDocQuotaFromResponse({ quota: { count: loadDocs().length, max: _docQuota.max, can_add: loadDocs().length < (_docQuota.max || LANHU_DOC_MAX), is_unlimited: _docQuota.isUnlimited } });
            return d.doc;
        });
    }

    function deleteDocOnServer(id) {
        return apiJson('/api/user-lanhu-docs/' + encodeURIComponent(id), {
            method: 'DELETE'
        }).then(function(d) {
            if (!d.ok) throw new Error(d.error || '删除失败');
            _docsCache = _docsCache.filter(function(item) { return item.id !== id; });
            _docQuota.count = loadDocs().length;
            _docQuota.canAdd = _docQuota.isUnlimited || _docQuota.count < (_docQuota.max || LANHU_DOC_MAX);
            renderDocList();
        });
    }

    function switchToDoc(id) {
        if (typeof window.isTcQualityCheckLanhuNavBlocked === 'function' &&
            window.isTcQualityCheckLanhuNavBlocked()) {
            if (typeof window.toastTcQualityCheckNavBlocked === 'function') {
                window.toastTcQualityCheckNavBlocked();
            }
            return;
        }
        if (typeof window.isTcLanhuDocSwitchBlockedDuringGeneration === 'function' &&
            window.isTcLanhuDocSwitchBlockedDuringGeneration()) {
            if (typeof window.toastTcLanhuDocSwitchBlockedDuringGeneration === 'function') {
                window.toastTcLanhuDocSwitchBlockedDuringGeneration();
            }
            return;
        }
        var docs = loadDocs();
        var doc = null;
        for (var i = 0; i < docs.length; i++) { if (docs[i].id === id) { doc = docs[i]; break; } }
        if (!doc) return;

        if (typeof window.TcRequirementCaseStore !== 'undefined' &&
            typeof window.TcRequirementCaseStore.persistActivePageBeforeLeave === 'function') {
            window.TcRequirementCaseStore.persistActivePageBeforeLeave('manual_edit', { force: true, allowEmpty: true });
        }
        var ueBeforeDoc = document.getElementById('lanhu-url');
        var prevDocUrl = ueBeforeDoc ? String(ueBeforeDoc.value || '').trim() : '';
        var nextDocUrl = String(doc.url || '').trim();
        if (prevDocUrl !== nextDocUrl && typeof window.tcQcPageSessionClearOnLeave === 'function') {
            window.tcQcPageSessionClearOnLeave('doc_switch');
        }
        var ce = document.getElementById('lanhu-cookie');
        var ue = document.getElementById('lanhu-url');
        if (ce) ce.value = doc.cookie || '';
        if (ue) ue.value = doc.url || '';
        var treeTitleEl = document.getElementById('tc-lanhu-tree-doc-title');
        if (treeTitleEl && doc.name) {
            treeTitleEl.textContent = doc.name;
            treeTitleEl.setAttribute('title', doc.name);
        }
        if (typeof autoGrowTcPresetLanhuField === 'function') {
            autoGrowTcPresetLanhuField(ce);
            autoGrowTcPresetLanhuField(ue);
        }
        if (typeof window.refreshTcLanhuDocTree === 'function') {
            window.refreshTcLanhuDocTree();
        }
    }

    function saveCurrentAsDoc(opts) {
        opts = opts || {};
        if (opts.auto && window._tcSuppressConnectAutoDocSave) return;
        var ce = document.getElementById('lanhu-cookie');
        var ue = document.getElementById('lanhu-url');
        var c = ce ? String(ce.value || '').trim() : '';
        var u = normalizeLanhuDocUrlForSave(ue ? String(ue.value || '').trim() : '');
        if (!c || !u) return;
        if (ue && ue.value !== u) ue.value = u;
        var docNameInput = document.getElementById('tc-lanhu-connect-doc-name');
        var n = docNameInput ? String(docNameInput.value || '').trim() : '';
        var te = document.getElementById('tc-lanhu-tree-doc-title');
        if (!n) n = (te && te.textContent && te.textContent !== '蓝湖需求树' && te.textContent !== '蓝湖需求') ? te.textContent : '';
        if (!n && u) {
            var m = u.match(/[?&]title=([^&]+)/) || u.match(/lanhuapp\.com\/[^/]+\/[^/]+\/([^/?]+)/);
            if (m) n = decodeURIComponent(m[1]);
        }
        if (!n) n = '文档 ' + new Date().toLocaleDateString('zh-CN');
        var payload = { name: n, cookie: c, url: u, lanhu_cookie: c, lanhu_url: u };

        if (_serverMode) {
            upsertDocOnServer(payload).catch(function(err) {
                if (handleLanhuDocServerError(err)) return;
                if (typeof tcAppToast === 'function') tcAppToast(err.message || '保存文档失败', { variant: 'error' });
            });
            return;
        }

        var docs = loadLocalDocs();
        var key = extractLanhuDocKey(u);
        var exist = null;
        for (var i = 0; i < docs.length; i++) {
            if (docs[i].url === u || getDocKey(docs[i]) === key) { exist = docs[i]; break; }
        }
        if (exist) {
            exist.cookie = c;
            exist.name = n;
            exist.url = u;
            exist.lanhuDocKey = key;
            exist.updatedAt = Date.now();
        } else {
            docs.push({
                id: genId(), name: n, cookie: c, url: u, lanhuDocKey: key,
                createdAt: Date.now(), updatedAt: Date.now()
            });
        }
        persistDocsLocal(docs);
    }

    function isActiveLanhuSavedDoc(doc) {
        if (!doc) return false;
        var docKey = getDocKey(doc);
        var urlEl = document.getElementById('lanhu-url');
        var currentUrl = urlEl ? String(urlEl.value || '').trim() : '';
        if (currentUrl) {
            if (doc.url && currentUrl === String(doc.url).trim()) return true;
            if (docKey && docKey === extractLanhuDocKey(currentUrl)) return true;
        }
        if (typeof window.getTcLanhuDocTreeMeta === 'function') {
            var meta = window.getTcLanhuDocTreeMeta() || {};
            var treeDocId = String(meta.docId || '').trim();
            if (treeDocId && docKey === ('doc:' + treeDocId)) return true;
        }
        return false;
    }

    function pickMostRecentLanhuDoc(docs) {
        if (!docs || !docs.length) return null;
        return docs.slice().sort(function(a, b) {
            var ta = Number(a.updatedAt || a.createdAt || 0);
            var tb = Number(b.updatedAt || b.createdAt || 0);
            return tb - ta;
        })[0];
    }

    function handleAfterDocRemoved(removedDoc) {
        if (!removedDoc || !isActiveLanhuSavedDoc(removedDoc)) return;
        var remaining = loadDocs();
        if (remaining.length) {
            var next = pickMostRecentLanhuDoc(remaining);
            if (next && next.id) switchToDoc(next.id);
            return;
        }
        if (typeof window.clearTcLanhuDocTreeView === 'function') {
            window.clearTcLanhuDocTreeView();
        }
    }

    function removeDoc(id) {
        var removedDoc = null;
        try {
            var docs = loadDocs();
            for (var i = 0; i < docs.length; i++) {
                if (docs[i].id === id) { removedDoc = docs[i]; break; }
            }
        } catch (e) { /* ignore */ }
        var name = removedDoc ? (removedDoc.name || '') : '';
        if (_serverMode) {
            deleteDocOnServer(id).then(function () {
                handleAfterDocRemoved(removedDoc);
                if (typeof tcAppToast === 'function') {
                    tcAppToast((name ? '「' + name + '」' : '文档') + ' 已删除', { variant: 'success', duration: 2800 });
                }
            }).catch(function(err) {
                if (typeof tcAppToast === 'function') tcAppToast(err.message || '删除失败', { variant: 'error' });
            });
            return;
        }
        var localDocs = loadLocalDocs().filter(function(d) { return d.id !== id; });
        persistDocsLocal(localDocs);
        handleAfterDocRemoved(removedDoc);
        if (typeof tcAppToast === 'function') {
            tcAppToast((name ? '「' + name + '」' : '文档') + ' 已删除', { variant: 'success', duration: 2800 });
        }
    }

    /**
     * 合并入口：新增/连接共用「连接蓝湖文档」弹窗。
     * 不改动旧 confirmAddDoc；仅改打开路径，避免影响其它调用方。
     */
    function openAddDocModal() {
        if (typeof window.isTcLanhuTreeHeadActionsBlocked === 'function' && window.isTcLanhuTreeHeadActionsBlocked()) {
            if (typeof window.toastTcLanhuTreeHeadActionsBlocked === 'function') window.toastTcLanhuTreeHeadActionsBlocked();
            return;
        }
        if (shouldBlockLanhuDocAdd()) {
            showLanhuDocQuotaBlockedAlert();
            return;
        }
        if (typeof window.openTcConnectModalForAdd === 'function') {
            window.openTcConnectModalForAdd();
            return;
        }
        /* 兜底：连接弹窗编排不可用时仍走旧新增弹窗 */
        var m = document.getElementById('tc-lanhu-doc-add-modal');
        if (!m) return;
        document.getElementById('tc-lanhu-doc-add-name').value = '';
        var ci = document.getElementById('tc-lanhu-doc-add-cookie');
        if (ci) ci.value = '';
        var ui = document.getElementById('tc-lanhu-doc-add-url');
        if (ui) ui.value = '';
        m.classList.remove('hidden');
        m.classList.add('flex');
        document.body.style.overflow = 'hidden';
        setTimeout(function() { (document.getElementById('tc-lanhu-doc-add-name') || {}).focus(); }, 100);
    }

    /**
     * 仅供合并后的连接确认使用：已有同 URL 文档可继续（更新/重连）；
     * 全新 URL 才做配额拦截。不改 shouldBlockLanhuDocAdd / findDuplicateDoc 语义。
     */
    function canProceedLanhuConnectSave(url) {
        var norm = normalizeLanhuDocUrlForSave(String(url || '').trim());
        if (!norm) return { ok: false, reason: 'empty_url' };
        if (findDuplicateDoc(norm)) return { ok: true, exists: true };
        if (shouldBlockLanhuDocAdd()) return { ok: false, reason: 'quota' };
        return { ok: true, exists: false };
    }

    function closeAddDocModal() {
        var m = document.getElementById('tc-lanhu-doc-add-modal');
        if (!m) return;
        m.classList.add('hidden');
        m.classList.remove('flex');
        document.body.style.overflow = '';
    }

    function confirmAddDoc() {
        var name = (document.getElementById('tc-lanhu-doc-add-name') || {}).value || '';
        var cookie = (document.getElementById('tc-lanhu-doc-add-cookie') || {}).value || '';
        var url = (document.getElementById('tc-lanhu-doc-add-url') || {}).value || '';
        name = String(name).trim();
        cookie = String(cookie).trim();
        url = normalizeLanhuDocUrlForSave(String(url).trim());
        if (!name) { if (typeof tcAppToast === 'function') tcAppToast('请输入文档名称', { variant: 'warning' }); return; }
        if (!cookie || !url) { if (typeof tcAppToast === 'function') tcAppToast('请填写 Cookie 和 URL', { variant: 'warning' }); return; }
        if (!validateLanhuDocUrlForSave(url)) { toastInvalidLanhuDocUrl(); return; }
        if (shouldBlockLanhuDocAdd()) { showLanhuDocQuotaBlockedAlert(); return; }
        if (findDuplicateDoc(url)) { warnDuplicateDoc(); return; }

        var payload = { name: name, cookie: cookie, url: url, lanhu_cookie: cookie, lanhu_url: url };

        if (_serverMode) {
            window._tcSuppressConnectAutoDocSave = true;
            createDocOnServer(payload).then(function(doc) {
                closeAddDocModal();
                switchToDoc(doc.id);
                window.setTimeout(function() { window._tcSuppressConnectAutoDocSave = false; }, 2500);
                if (typeof tcAppToast === 'function') tcAppToast('文档「' + name + '」已添加', { variant: 'success', duration: 2000 });
            }).catch(function(err) {
                window._tcSuppressConnectAutoDocSave = false;
                if (handleLanhuDocServerError(err)) return;
                if (err && err.code === 'lanhu_doc_invalid_url') { toastInvalidLanhuDocUrl(); return; }
                if (typeof tcAppToast === 'function') tcAppToast(err.message || '添加失败', { variant: 'error' });
            });
            return;
        }

        var docs = loadLocalDocs();
        var d = {
            id: genId(), name: name, cookie: cookie, url: url,
            lanhuDocKey: extractLanhuDocKey(url),
            createdAt: Date.now(), updatedAt: Date.now()
        };
        docs.push(d);
        persistDocsLocal(docs);
        closeAddDocModal();
        switchToDoc(d.id);
        if (typeof tcAppToast === 'function') tcAppToast('文档「' + name + '」已添加', { variant: 'success', duration: 2000 });
    }

    function renderDocList() {
        var c = document.getElementById('tc-lanhu-doc-list-container');
        if (!c) return;
        var docs = loadDocs();
        if (!docs.length) {
            c.innerHTML = '<div class="tc-doc-switcher-empty">暂无已保存文档</div>';
            return;
        }
        var h = '';
        for (var i = 0; i < docs.length; i++) {
            var d = docs[i];
            var sn = d.name.length > 16 ? d.name.slice(0, 15) + '…' : d.name;
            var t = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
            h += '<div class="tc-doc-switcher-item" data-doc-id="' + d.id + '">' +
                '<span class="tc-doc-switcher-item__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M7 4h7l5 5v11a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg></span>' +
                '<span class="tc-doc-switcher-item__name" title="' + d.name + '">' + sn + '</span>' +
                (t ? '<span class="tc-doc-switcher-item__time">' + t + '</span>' : '') +
                '<button type="button" class="tc-doc-switcher-item__del" data-doc-del="' + d.id + '" title="删除此文档">&times;</button>' +
                '</div>';
        }
        c.innerHTML = h;
    }

    function toggleDocSwitcher() {
        var p = document.getElementById('tc-lanhu-doc-switcher-panel');
        if (!p) return;
        if (p.classList.contains('tc-doc-switcher-panel--open')) {
            p.classList.remove('tc-doc-switcher-panel--open');
            p.hidden = true;
            p.setAttribute('aria-hidden', 'true');
        } else {
            if (_serverMode) {
                refreshDocsFromServer().then(function() {
                    positionDocSwitcher();
                    p.hidden = false;
                    p.setAttribute('aria-hidden', 'false');
                    p.classList.add('tc-doc-switcher-panel--open');
                });
            } else {
                renderDocList();
                positionDocSwitcher();
                p.hidden = false;
                p.setAttribute('aria-hidden', 'false');
                p.classList.add('tc-doc-switcher-panel--open');
            }
        }
    }

    function setupDocSwitcherUI() {
        var titles = document.querySelector('.tc-lanhu-tree-rail__titles');
        if (!titles || document.getElementById('tc-lanhu-doc-switcher-trigger')) return;

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.id = 'tc-lanhu-doc-switcher-trigger';
        trigger.className = 'tc-doc-switcher-trigger';
        trigger.title = '切换文档';
        trigger.setAttribute('aria-label', '切换文档');
        trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
        trigger.addEventListener('click', function(e) { e.stopPropagation(); toggleDocSwitcher(); });
        titles.appendChild(trigger);

        var panel = document.createElement('div');
        panel.id = 'tc-lanhu-doc-switcher-panel';
        panel.className = 'tc-doc-switcher-panel';
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML =
            '<div class="tc-doc-switcher-panel__head">' +
                '<span class="tc-doc-switcher-panel__title">已保存文档</span>' +
                '<button type="button" class="tc-doc-switcher-panel__add" id="tc-lanhu-doc-add-btn" title="添加 / 连接蓝湖文档">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                '</button>' +
            '</div>' +
            '<div id="tc-lanhu-doc-list-container" class="tc-doc-switcher-list"></div>';
        document.body.appendChild(panel);

        panel.addEventListener('click', function(e) {
            var del = e.target.closest('[data-doc-del]');
            if (del) {
                e.stopPropagation();
                var did = del.getAttribute('data-doc-del');
                if (!did) return;
                var docNode = del.closest('[data-doc-id]');
                var docName = '';
                if (docNode) {
                    var nameEl = docNode.querySelector('.tc-doc-switcher-item__name');
                    if (nameEl) docName = nameEl.textContent.trim();
                    if (!docName) docName = nameEl ? nameEl.getAttribute('title') || '' : '';
                }
                if (typeof tcAppConfirm === 'function') {
                    tcAppConfirm('确定删除此文档？' + (docName ? '「' + docName + '」' : ''), {
                        title: '删除文档',
                        variant: 'error',
                        confirmText: '删除',
                        cancelText: '保留'
                    }).then(function (ok) { if (ok) removeDoc(did); });
                } else {
                    if (confirm('确定删除此文档？' + (docName ? '「' + docName + '」' : ''))) removeDoc(did);
                }
                return;
            }
            var item = e.target.closest('[data-doc-id]');
            if (item) { var did = item.getAttribute('data-doc-id'); if (did) { switchToDoc(did); toggleDocSwitcher(); } return; }
        });
        document.getElementById('tc-lanhu-doc-add-btn').addEventListener('click', function(e) { e.stopPropagation(); toggleDocSwitcher(); openAddDocModal(); });

        document.addEventListener('click', function(e) {
            var p = document.getElementById('tc-lanhu-doc-switcher-panel');
            var t = document.getElementById('tc-lanhu-doc-switcher-trigger');
            if (!p || !p.classList.contains('tc-doc-switcher-panel--open')) return;
            if (!p.contains(e.target) && e.target !== t && !t.contains(e.target)) {
                p.classList.remove('tc-doc-switcher-panel--open');
            p.hidden = true;
            p.setAttribute('aria-hidden', 'true');
            }
        });
    }

    function interceptConnectSave() {
        var cb = document.getElementById('tc-lanhu-tree-connect-confirm');
        if (cb) {
            cb.addEventListener('click', function() {
                scheduleConnectAutoDocSave(1500);
            });
        }
        var m = document.getElementById('tc-lanhu-tree-connect-modal');
        if (m) {
            var ob = new MutationObserver(function(muts) {
                muts.forEach(function(mu) {
                    if (mu.type === 'attributes' && mu.attributeName === 'class') {
                        if (m.classList.contains('hidden')) scheduleConnectAutoDocSave(500);
                    }
                });
            });
            ob.observe(m, { attributes: true, attributeFilter: ['class'] });
        }
        var mount = document.getElementById('tc-lanhu-tree-mount');
        if (mount) {
            var ob2 = new MutationObserver(function() {
                var btn = mount.querySelector('[data-tc-lanhu-tree-connect]');
                if (btn && !btn.dataset.docPatched) {
                    btn.dataset.docPatched = '1';
                    btn.addEventListener('click', function() {
                        scheduleConnectAutoDocSave(2000);
                    });
                }
            });
            ob2.observe(mount, { childList: true, subtree: true });
        }
    }

    function getActiveSavedDocName() {
        var docs = loadDocs();
        for (var i = 0; i < docs.length; i++) {
            if (isActiveLanhuSavedDoc(docs[i])) return String(docs[i].name || '').trim();
        }
        return '';
    }

    function setConnectDocName(name) {
        name = String(name || '').trim();
        var input = document.getElementById('tc-lanhu-connect-doc-name');
        if (input && name) input.value = name;
        var titleEl = document.getElementById('tc-lanhu-tree-doc-title');
        if (titleEl && name) titleEl.textContent = name;
        if (typeof window.getTcLanhuDocTreeMeta === 'function') {
            try {
                var meta = window.getTcLanhuDocTreeMeta() || {};
                meta.docName = name;
            } catch (eMeta) { /* ignore */ }
        }
    }

    window.getTcLanhuActiveSavedDocName = getActiveSavedDocName;
    window.setTcLanhuConnectDocName = setConnectDocName;
    window.confirmAddDoc = confirmAddDoc;
    window.closeAddDocModal = closeAddDocModal;
    window.openAddDocModal = openAddDocModal;
    window.tcCanProceedLanhuConnectSave = canProceedLanhuConnectSave;
    window.tcShowLanhuDocQuotaBlocked = showLanhuDocQuotaBlockedAlert;
    window.getTcLanhuSavedDocUrlForTreeDocId = getSavedDocUrlForLanhuDocId;
    window.refreshTcLanhuDocList = refreshDocsFromServer;

    function positionDocSwitcher() {
        var titles = document.querySelector('.tc-lanhu-tree-rail__titles');
        if (!titles) return;
        var rect = titles.getBoundingClientRect();
        var panel = document.getElementById('tc-lanhu-doc-switcher-panel');
        if (!panel) return;
        panel.style.setProperty('--tc-ds-top', (rect.bottom + 6) + 'px');
        panel.style.setProperty('--tc-ds-left', Math.max(8, rect.left) + 'px');
    }

    function init() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        Promise.all([refreshDocsFromServer(), refreshLanhuDocQuotaAuth()]).then(function() {
            setupDocSwitcherUI();
            interceptConnectSave();
            if (!_docsReady) renderDocList();
        });
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
