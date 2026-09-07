/* 智能编辑 — 视觉附件（独立实现，与智能生成附件模块隔离）
 * 策略：上传仅保存文件；点击发送时再调用视觉模型解析并构建上下文。 */
(function (global) {
    'use strict';

    var state = {
        enabled: false,
        authed: false,
        isAdmin: false,
        visionConfigured: false,
        visionQuotaExhausted: false,
        assets: [],
        visualContextId: null,
        contextDirty: false,
        preparingOnSend: false,
        limits: {
            maxAttachFiles: 4,
            maxBatchFiles: 4
        }
    };

    var uploadChain = Promise.resolve();

    function $(id) { return document.getElementById(id); }

    function getComposerRoot() {
        return $('tc-edit-prompt-composer');
    }

    function getAttachmentsGrid() {
        var root = getComposerRoot();
        if (root) {
            var scoped = root.querySelector('#tc-edit-prompt-composer-attachments');
            if (scoped) return scoped;
        }
        return $('tc-edit-prompt-composer-attachments');
    }

    function toast(msg, variant) {
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast(msg, { variant: variant || 'info', duration: 3200 });
        }
    }

    function getMaxAttachFiles() {
        var n = state.limits && state.limits.maxAttachFiles;
        return typeof n === 'number' && n > 0 ? n : 4;
    }

    function getRemainingSlots() {
        return Math.max(0, getMaxAttachFiles() - state.assets.length);
    }

    var ALLOWED_EXT = /\.(png|jpe?g|webp|pdf|txt)$/i;
    var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    var MAX_PDF_BYTES = 30 * 1024 * 1024;
    var MAX_TXT_BYTES = 2 * 1024 * 1024;

    function classifyUploadFile(file) {
        var name = String((file && file.name) || '').toLowerCase();
        var mime = String((file && file.type) || '').split(';')[0].trim().toLowerCase();
        if (/\.pdf$/.test(name) || mime === 'application/pdf') return 'pdf';
        if (/\.txt$/.test(name) || mime === 'text/plain') return 'txt';
        if (/\.(png|jpe?g|webp)$/.test(name) || /^image\//.test(mime)) return 'image';
        return '';
    }

    function validateUploadFile(file) {
        if (!file || !file.name) return '无效文件';
        var kind = classifyUploadFile(file);
        if (!kind) return '仅支持 PNG/JPG/WebP 图片、PDF 或 TXT 文本';
        if (!ALLOWED_EXT.test(file.name)) return '文件扩展名不受支持：' + file.name;
        var size = file.size || 0;
        if (kind === 'pdf' && size > MAX_PDF_BYTES) return 'PDF 超过 30MB 限制';
        if (kind === 'txt' && size > MAX_TXT_BYTES) return 'TXT 超过 2MB 限制';
        if (kind === 'image' && size > MAX_IMAGE_BYTES) return '图片超过 10MB 限制';
        return '';
    }

    function validateUploadFiles(fileList) {
        if (!fileList || !fileList.length) return [];
        var errors = [];
        var valid = [];
        for (var i = 0; i < fileList.length; i++) {
            var err = validateUploadFile(fileList[i]);
            if (err) errors.push(err);
            else valid.push(fileList[i]);
        }
        if (errors.length && !valid.length) {
            toast(errors[0], 'warning');
            return [];
        }
        if (errors.length) {
            toast(errors[0] + (errors.length > 1 ? ' 等' : ''), 'warning');
        }
        return valid;
    }

    function isAttachLimitReached() {
        return state.assets.length >= getMaxAttachFiles();
    }

    function applyAuthFromMe(me) {
        state.authed = !!(me && me.authenticated);
        state.isAdmin = !!(me && me.can_manage_builtin_ai);
    }

    function syncComposerClass() {
        var root = getComposerRoot();
        if (!root) return;
        root.classList.toggle('tc-prompt-composer--attach-full', isAttachLimitReached());
        root.classList.toggle('tc-prompt-composer--has-attachments', state.assets.length > 0);
    }

    function refreshComposerLayout() {
        syncComposerClass();
        if (typeof global.tcLeftFloatRefreshContentHeights === 'function') {
            global.tcLeftFloatRefreshContentHeights();
        }
    }

    function isEditComposerDrawerActive() {
        var wrap = $('left-content-wrapper');
        if (!wrap) return false;
        if (wrap.getAttribute('data-active-drawer') === '2') return false;
        if (wrap.getAttribute('data-active-gen-mode') === 'edit') return true;
        var editPanel = $('drawer-edit-content');
        return !!(editPanel && !editPanel.classList.contains('hidden'));
    }

    function isLeftPanelVisible() {
        var panel = $('left-panel');
        if (!panel) return false;
        if (panel.getAttribute('aria-hidden') === 'true') return false;
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return false;
        return true;
    }

    function applyVisionFromCache() {
        if (!state.authed || state.isAdmin) return;
        if (global.HfUserAiConfig && typeof global.HfUserAiConfig.isVisionConfigured === 'function') {
            if (global.HfUserAiConfig.isVisionConfigured()) {
                state.visionConfigured = true;
            }
        }
    }

    function refreshOnPanelOpen() {
        if (!isLeftPanelVisible() || !isEditComposerDrawerActive()) return;
        ensureInit();
        renderAttachments();
        var chain = Promise.resolve();
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            chain = global.HfAuthNav.fetchMe().then(function (me) {
                applyAuthFromMe(me);
            }).catch(function () {});
        }
        chain.then(function () {
            if (!state.authed) {
                state.visionConfigured = false;
                refreshComposerLayout();
                return;
            }
            applyVisionFromCache();
            return fetchStatus();
        }).catch(function () {
            refreshComposerLayout();
        });
    }

    function watchLeftPanelOpen() {
        var panel = $('left-panel');
        if (!panel || panel._tcEditAttachPanelWatch) return;
        panel._tcEditAttachPanelWatch = true;
        var lastVisible = false;
        function check() {
            var visible = isLeftPanelVisible() && isEditComposerDrawerActive();
            if (visible && !lastVisible) {
                refreshOnPanelOpen();
            }
            lastVisible = visible;
        }
        var obs = new MutationObserver(check);
        obs.observe(panel, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
        var wrap = $('left-content-wrapper');
        if (wrap) {
            var wrapObs = new MutationObserver(check);
            wrapObs.observe(wrap, { attributes: true, attributeFilter: ['data-active-drawer', 'data-active-gen-mode'] });
        }
        var editPanel = $('drawer-edit-content');
        if (editPanel) {
            var editObs = new MutationObserver(check);
            editObs.observe(editPanel, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
        }
        check();
    }

    function promptVisionConfigSetup() {
        if (state.isAdmin) {
            var adminOpen = global.HfBuiltinAiAdmin && global.HfBuiltinAiAdmin.openModal;
            if (typeof adminOpen !== 'function') return Promise.resolve(false);
            adminOpen.call(global.HfBuiltinAiAdmin, { focusVision: true });
            return Promise.resolve(false);
        }
        var openFn = global.HfUserAiConfig && global.HfUserAiConfig.openModal;
        if (typeof openFn !== 'function') return Promise.resolve(false);
        openFn.call(global.HfUserAiConfig, { focusVision: true });
        return Promise.resolve(false);
    }

    function ensureAuthenticatedForUpload() {
        function applyAuth(data) {
            applyAuthFromMe(data);
            state.authed = !!(data && data.authenticated);
            return state.authed;
        }
        if (global.HfAuthNav && typeof global.HfAuthNav.ensureAuthenticated === 'function') {
            return global.HfAuthNav.ensureAuthenticated({
                next: global.location.pathname + global.location.search
            }).then(function (data) {
                return applyAuth(data);
            });
        }
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            return global.HfAuthNav.fetchMe().then(function (me) {
                if (!applyAuth(me) && global.HfAuthNav.loginUrl) {
                    global.location.href = global.HfAuthNav.loginUrl(
                        global.location.pathname + global.location.search
                    );
                    return false;
                }
                return state.authed;
            });
        }
        return Promise.resolve(true);
    }

    function ensureVisionConfigured() {
        if (state.visionConfigured) return Promise.resolve(true);
        return fetchStatus().then(function (ok) {
            if (ok) return true;
            if (state.visionQuotaExhausted) {
                if (typeof globalThis.hfAiQuotaNotify === 'function') {
                    globalThis.hfAiQuotaNotify({
                        kind: 'vision',
                        kind_label: '视觉模型',
                        used_site_builtin: true,
                        remaining: 0,
                        exhausted: true
                    });
                }
                return false;
            }
            return promptVisionConfigSetup();
        });
    }

    function fetchStatus() {
        return fetch('/api/test-cases/attachments/status', { credentials: 'same-origin' })
            .then(function (r) {
                if (r.status === 401) {
                    state.authed = false;
                    return { enabled: false, vision_configured: false, unauthenticated: true };
                }
                state.authed = true;
                return r.json();
            })
            .then(function (d) {
                if (d && d.unauthenticated) {
                    state.enabled = false;
                    state.visionConfigured = false;
                    refreshComposerLayout();
                    return false;
                }
                state.enabled = !!(d && d.enabled);
                state.visionConfigured = !!(d && d.vision_configured);
                state.visionQuotaExhausted = !!(d && d.vision_quota_exhausted);
                if (d && d.max_attach_files) state.limits.maxAttachFiles = d.max_attach_files;
                if (d && d.max_batch_files) state.limits.maxBatchFiles = d.max_batch_files;
                refreshComposerLayout();
                return state.visionConfigured;
            })
            .catch(function () {
                state.enabled = false;
                state.visionConfigured = false;
                refreshComposerLayout();
                return false;
            });
    }

    function beginUploadFlow(openFilePicker) {
        if (isAttachLimitReached()) {
            toast('已达附件上限，请先移除部分后再添加', 'warning');
            return Promise.resolve();
        }
        return ensureAuthenticatedForUpload().then(function (ok) {
            if (!ok) return;
            refreshComposerLayout();
            if (openFilePicker) openFilePicker();
        });
    }

    /** 发送前解析中，或上传占位中 — 用于禁用发送按钮 */
    function isComposerAttachmentParsePending() {
        if (state.preparingOnSend) return true;
        return state.assets.some(function (asset) {
            return asset && asset._optimistic;
        });
    }

    function getEditAbortSignal() {
        if (global.TcAiSmartEdit && typeof global.TcAiSmartEdit.getAbortSignal === 'function') {
            return global.TcAiSmartEdit.getAbortSignal();
        }
        return undefined;
    }

    function cancelPrepareForEditSend() {
        state.preparingOnSend = false;
        syncEditComposerSendBtnFromAttachments();
    }

    function syncEditComposerSendBtnFromAttachments() {
        if (typeof global.syncTcEditSendBtnState === 'function') {
            global.syncTcEditSendBtnState();
        }
    }

    function revokeOptimisticAsset(asset) {
        if (asset && asset._objectUrl) {
            try { URL.revokeObjectURL(asset._objectUrl); } catch (e) { /* ignore */ }
        }
    }

    function removeOptimisticByBatch(batchId) {
        if (!batchId) return;
        var kept = [];
        state.assets.forEach(function (asset) {
            if (asset && asset._optimistic && asset._optimisticBatch === batchId) {
                revokeOptimisticAsset(asset);
                return;
            }
            kept.push(asset);
        });
        state.assets = kept;
    }

    function normalizeAssetThumb(asset) {
        if (!asset || asset.thumb_url) return asset;
        if (asset.id && !asset._optimistic) {
            asset.thumb_url = '/api/test-cases/attachments/' + asset.id + '/thumb';
        }
        return asset;
    }

    function addOptimisticAssets(files) {
        if (!files || !files.length) return '';
        var batchId = 'batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        var stamp = Date.now();
        files.forEach(function (file, index) {
            var kind = classifyUploadFile(file);
            var mime = String((file && file.type) || '').split(';')[0].trim().toLowerCase();
            if (!mime && kind === 'pdf') mime = 'application/pdf';
            if (!mime && kind === 'txt') mime = 'text/plain';
            if (!mime && kind === 'image') mime = 'image/jpeg';
            var asset = {
                id: 'temp-' + stamp + '-' + index,
                mime_type: mime,
                parse_status: 'pending',
                _optimistic: true,
                _optimisticBatch: batchId,
                _fileName: String((file && file.name) || '附件')
            };
            if (kind === 'image' && global.URL && typeof global.URL.createObjectURL === 'function') {
                asset._objectUrl = global.URL.createObjectURL(file);
                asset.thumb_url = asset._objectUrl;
            }
            state.assets.push(asset);
        });
        state.contextDirty = true;
        state.visualContextId = null;
        renderAttachments();
        return batchId;
    }

    function getAttachmentBadgeText(asset) {
        if (asset._optimistic) return '上传中';
        if (asset.parse_status === 'error') return '失败';
        if (asset.parse_status === 'done') return '就绪';
        if (state.preparingOnSend) {
            if (asset.parse_status === 'processing') return '解析中';
            return '等待';
        }
        return '待发送';
    }

    function renderAttachments() {
        var grid = getAttachmentsGrid();
        if (!grid) return;
        grid.innerHTML = '';
        state.assets.forEach(function (asset) {
            var card = document.createElement('div');
            card.className = 'tc-attach-card';
            card.setAttribute('data-asset-id', asset.id);

            var isPdf = (asset.mime_type || '').indexOf('pdf') >= 0;
            var isTxt = (asset.mime_type || '').indexOf('text') >= 0;
            if (asset.thumb_url && !isPdf && !isTxt) {
                var img = document.createElement('img');
                img.className = 'tc-attach-card__img';
                img.src = asset.thumb_url;
                img.alt = asset._fileName || '附件';
                card.appendChild(img);
            } else {
                var doc = document.createElement('div');
                doc.className = 'tc-attach-card__doc';
                doc.textContent = isPdf ? 'PDF' : (isTxt ? 'TXT' : 'IMG');
                card.appendChild(doc);
            }

            var badge = document.createElement('div');
            badge.className = 'tc-attach-card__badge';
            var badgeText = getAttachmentBadgeText(asset);
            if (asset.parse_status === 'error') {
                badge.classList.add('tc-attach-card__badge--error');
            } else if (asset.parse_status !== 'done') {
                badge.classList.add('tc-attach-card__badge--pending');
            }
            badge.textContent = badgeText;
            card.appendChild(badge);

            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'tc-attach-card__remove';
            rm.setAttribute('aria-label', '移除附件');
            rm.textContent = '×';
            rm.addEventListener('click', function () { removeAsset(asset.id); });
            card.appendChild(rm);

            grid.appendChild(card);
        });
        refreshComposerLayout();
        syncEditComposerSendBtnFromAttachments();
    }

    function upsertAsset(asset) {
        var idx = -1;
        for (var i = 0; i < state.assets.length; i++) {
            if (state.assets[i].id === asset.id) { idx = i; break; }
        }
        if (idx >= 0) state.assets[idx] = asset;
        else state.assets.push(asset);
        state.contextDirty = true;
        state.visualContextId = null;
        renderAttachments();
    }

    function getRealAssetIds() {
        return state.assets
            .filter(function (asset) {
                return asset && asset.id && !asset._optimistic;
            })
            .map(function (asset) { return asset.id; })
            .slice(0, getMaxAttachFiles());
    }

    function pickFilesForUpload(fileList) {
        if (!fileList || !fileList.length) return [];
        var validated = validateUploadFiles(fileList);
        if (!validated.length) return [];
        var remaining = getRemainingSlots();
        if (remaining <= 0) {
            toast('已达附件上限，请先移除部分后再添加', 'warning');
            return [];
        }
        var batchMax = state.limits.maxBatchFiles || getMaxAttachFiles();
        var allowed = Math.min(remaining, batchMax);
        var picked = validated.slice(0, allowed);
        if (picked.length < validated.length) {
            toast('附件数量已达上限，已选取前 ' + picked.length + ' 个', 'warning');
        }
        return picked;
    }

    function uploadFilesInternal(fileList) {
        if (!fileList || !fileList.length) return Promise.resolve();
        return ensureAuthenticatedForUpload().then(function (ok) {
            if (!ok) return;
            var picked = pickFilesForUpload(fileList);
            if (!picked.length) return;
            var batchId = addOptimisticAssets(picked);
            var fd = new FormData();
            fd.append('defer_parse', '1');
            for (var i = 0; i < picked.length; i++) {
                fd.append('files[]', picked[i]);
            }
            getRealAssetIds().forEach(function (assetId) {
                fd.append('existing_asset_ids[]', assetId);
            });
            return fetch('/api/test-cases/attachments/batch', {
                method: 'POST',
                credentials: 'same-origin',
                body: fd
            })
                .then(function (r) {
                    return r.json().then(function (d) {
                        if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
                        return d;
                    });
                })
                .then(function (d) {
                    removeOptimisticByBatch(batchId);
                    (d.assets || []).forEach(function (asset) {
                        upsertAsset(normalizeAssetThumb(asset));
                    });
                    renderAttachments();
                    if (d && d.ai_quota && typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(d.ai_quota);
                    }
                })
                .catch(function (err) {
                    removeOptimisticByBatch(batchId);
                    renderAttachments();
                    toast((err && err.message) || '上传失败', 'error');
                });
        });
    }

    function uploadFiles(fileList) {
        if (!fileList || !fileList.length) return Promise.resolve();
        var task = uploadChain.then(function () {
            return uploadFilesInternal(fileList);
        });
        uploadChain = task.catch(function () {});
        return task;
    }

    function inferAttachmentKind(mime) {
        var m = String(mime || '').toLowerCase();
        if (m.indexOf('pdf') >= 0) return 'pdf';
        if (m.indexOf('text') >= 0) return 'txt';
        return 'image';
    }

    function buildChatDisplayItem(asset) {
        if (!asset || !asset.id || asset._optimistic) return null;
        var mime = String(asset.mime_type || '').toLowerCase();
        var kind = inferAttachmentKind(mime);
        var isPdf = kind === 'pdf';
        var isTxt = kind === 'txt';
        var fileName = String(asset._fileName || '').trim();
        if (!fileName) {
            fileName = isPdf ? 'PDF 文档' : (isTxt ? '文本文档' : '图片');
        }
        var thumb = '';
        if (!isPdf && !isTxt) {
            thumb = asset.thumb_url || ('/api/test-cases/attachments/' + encodeURIComponent(asset.id) + '/thumb');
        }
        return {
            id: asset.id,
            mime_type: mime,
            kind: kind,
            fileName: fileName,
            thumb_url: thumb
        };
    }

    function snapshotComposerAttachmentsForSend() {
        var displayItems = [];
        state.assets.forEach(function (asset) {
            var item = buildChatDisplayItem(asset);
            if (item) displayItems.push(item);
        });
        var assetIds = displayItems.map(function (item) { return item.id; });
        return {
            assetIds: assetIds.slice(),
            displayItems: displayItems,
            hadAttachments: displayItems.length > 0 || state.assets.some(function (a) { return a && a._optimistic; })
        };
    }

    /** 发送瞬间清空输入框上方附件 UI（不删服务器文件，供后台解析使用） */
    function hideComposerAttachments() {
        state.assets.forEach(revokeOptimisticAsset);
        state.assets = [];
        state.preparingOnSend = false;
        state.contextDirty = true;
        renderAttachments();
        refreshComposerLayout();
        syncEditComposerSendBtnFromAttachments();
    }

    function purgeComposerAttachmentsFromServer(assetIds) {
        (assetIds || []).forEach(function (assetId) {
            if (!assetId || String(assetId).indexOf('temp-') === 0) return;
            fetch('/api/test-cases/attachments/' + encodeURIComponent(assetId), {
                method: 'DELETE',
                credentials: 'same-origin'
            }).catch(function () {});
        });
    }

    function clearComposerAttachmentsAfterSend() {
        hideComposerAttachments();
        state.visualContextId = null;
        state.contextDirty = false;
    }

    function removeAsset(assetId) {
        var target = null;
        state.assets.forEach(function (asset) {
            if (asset && asset.id === assetId) target = asset;
        });
        if (target && target._optimistic) {
            revokeOptimisticAsset(target);
            state.assets = state.assets.filter(function (a) { return a.id !== assetId; });
            state.contextDirty = true;
            state.visualContextId = null;
            renderAttachments();
            return;
        }
        fetch('/api/test-cases/attachments/' + encodeURIComponent(assetId), {
            method: 'DELETE',
            credentials: 'same-origin'
        }).finally(function () {
            state.assets = state.assets.filter(function (a) { return a.id !== assetId; });
            state.contextDirty = true;
            state.visualContextId = null;
            renderAttachments();
        });
    }

    function getUserPromptSnippet() {
        var el = $('ai-edit-prompt');
        if (!el) return '';
        return String(el.value || '').trim().slice(0, 500);
    }

    function parseJsonResponse(r) {
        return r.text().then(function (text) {
            var data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    var hint = String(text || '').replace(/\s+/g, ' ').slice(0, 120);
                    throw new Error(
                        (r.ok ? '服务器返回格式异常' : ('请求失败 (HTTP ' + r.status + ')'))
                        + (hint ? ('：' + hint) : '')
                    );
                }
            } else {
                data = {};
            }
            if (!r.ok) {
                throw new Error((data && data.error) || ('HTTP ' + r.status));
            }
            return data;
        });
    }

    function rebuildContext(userPrompt, explicitAssetIds) {
        var assetIds = (explicitAssetIds && explicitAssetIds.length)
            ? explicitAssetIds.slice(0, getMaxAttachFiles())
            : getRealAssetIds();
        var sendFlow = !!(explicitAssetIds && explicitAssetIds.length);
        if (!assetIds.length) {
            state.visualContextId = null;
            state.contextDirty = false;
            return Promise.resolve(null);
        }
        if (!sendFlow && state.assets.some(function (a) { return a && a._optimistic; })) {
            return Promise.reject(new Error('附件上传中，请稍后再发送'));
        }
        var promptText = String(userPrompt || getUserPromptSnippet() || '').trim().slice(0, 500);
        if (!sendFlow && !state.contextDirty && state.visualContextId && !userPrompt) {
            return Promise.resolve(state.visualContextId);
        }
        return ensureVisionConfigured().then(function (configured) {
            if (!configured) {
                if (state.visionQuotaExhausted) {
                    return Promise.reject(new Error('VISION_QUOTA_EXHAUSTED'));
                }
                return Promise.reject(new Error('请先配置视觉模型后再发送带附件的编辑指令'));
            }
            state.preparingOnSend = true;
            if (!sendFlow) {
                renderAttachments();
            }
            syncEditComposerSendBtnFromAttachments();
            var prepareSignal = getEditAbortSignal();
            return fetch('/api/test-cases/attachments/edit-prepare-context', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                signal: prepareSignal,
                body: JSON.stringify({
                    asset_ids: assetIds,
                    user_prompt: promptText
                })
            })
                .then(function (r) {
                    return parseJsonResponse(r);
                })
                .then(function (d) {
                    var ctx = d && d.context;
                    state.visualContextId = ctx && ctx.id ? ctx.id : null;
                    if (d && d.ai_quota && typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(d.ai_quota);
                    }

                    state.contextDirty = false;
                    if (!state.visualContextId) {
                        throw new Error('附件上下文构建失败');
                    }
                    return state.visualContextId;
                })
                .catch(function (err) {
                    if (err && err.name === 'AbortError') {
                        throw err;
                    }
                    var msg = (err && err.message) ? err.message : String(err);
                    var quotaShown = typeof globalThis.hfAiQuotaFromErrorBody === 'function' &&
                        globalThis.hfAiQuotaFromErrorBody({ error: msg });
                    if (!quotaShown) {
                        toast(msg || '附件解析失败', 'error');
                        if (typeof global.tcAppAlert === 'function') {
                            global.tcAppAlert(msg || '附件解析失败', { variant: 'error', title: '附件解析失败' });
                        }
                    }
                    throw err;
                })
                .finally(function () {
                    state.preparingOnSend = false;
                    syncEditComposerSendBtnFromAttachments();
                });
        });
    }

    function clearVisualContext() {
        state.visualContextId = null;
        state.contextDirty = false;
    }

    function appendPayload(body) {
        if (!body || !state.visualContextId) return body;
        if (!getRealAssetIds().length && !body.use_attachments) return body;
        body.visual_context_id = state.visualContextId;
        return body;
    }

    function bindEvents() {
        var root = getComposerRoot();
        if (!root || root.dataset.tcEditAttachBound === '1') return;
        root.dataset.tcEditAttachBound = '1';

        var uploadBtn = $('tc-edit-attach-upload-btn');
        var fileInput = $('tc-edit-attach-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', function () {
                beginUploadFlow(function () { fileInput.click(); });
            });
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files.length) {
                    uploadFiles(Array.prototype.slice.call(fileInput.files));
                }
                fileInput.value = '';
            });
        }

        var box = $('tc-edit-prompt-composer-box');
        if (box) {
            box.addEventListener('dragover', function (e) {
                e.preventDefault();
                if (!isAttachLimitReached()) {
                    box.classList.add('tc-prompt-composer__box--drag');
                }
            });
            box.addEventListener('dragleave', function () {
                box.classList.remove('tc-prompt-composer__box--drag');
            });
            box.addEventListener('drop', function (e) {
                e.preventDefault();
                box.classList.remove('tc-prompt-composer__box--drag');
                var files = e.dataTransfer && e.dataTransfer.files;
                if (files && files.length) {
                    uploadFiles(Array.prototype.slice.call(files));
                }
            });
        }

        var promptEl = $('ai-edit-prompt');
        if (promptEl) {
            promptEl.addEventListener('input', function () {
                if (state.assets.length) {
                    state.contextDirty = true;
                    state.visualContextId = null;
                }
            });
        }

        global.addEventListener('hf-user-ai-config-updated', function (ev) {
            if (state.isAdmin) return;
            var d = ev && ev.detail;
            state.visionConfigured = !!(d && d.vision_configured);
            refreshComposerLayout();
            if (state.visionConfigured) fetchStatus();
        });

        global.addEventListener('hf-auth-nav-updated', function (ev) {
            applyAuthFromMe(ev.detail || {});
            refreshComposerLayout();
            if (state.authed) fetchStatus();
        });
    }

    function ensureInit() {
        if (!getComposerRoot()) return;
        bindEvents();
    }

    function init() {
        if (!getComposerRoot()) return;
        bindEvents();
        watchLeftPanelOpen();
        var authP = Promise.resolve();
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            authP = global.HfAuthNav.fetchMe().then(function (me) {
                applyAuthFromMe(me);
            }).catch(function () {});
        }
        authP.then(function () {
            applyVisionFromCache();
            return fetchStatus();
        }).then(function () {
            renderAttachments();
        });
    }

    global.TcEditAttachments = {
        init: init,
        ensureInit: ensureInit,
        uploadFiles: uploadFiles,
        getVisualContextId: function () { return state.visualContextId; },
        appendPayload: appendPayload,
        rebuildContext: rebuildContext,
        prepareContextForSmartEditSend: rebuildContext,
        snapshotComposerAttachmentsForSend: snapshotComposerAttachmentsForSend,
        hideComposerAttachments: hideComposerAttachments,
        clearVisualContext: clearVisualContext,
        purgeComposerAttachmentsFromServer: purgeComposerAttachmentsFromServer,
        clearComposerAttachmentsAfterSend: clearComposerAttachmentsAfterSend,
        isComposerAttachmentParsePending: isComposerAttachmentParsePending,
        cancelPrepareForEditSend: cancelPrepareForEditSend,
        hasUploadedAttachments: function () { return state.assets.length > 0; },
        getAssets: function () { return state.assets.slice(); },
        refreshOnPanelOpen: refreshOnPanelOpen,
        renderAttachments: renderAttachments
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
