/* TestHub — 用例录入视觉附件（普通用户个人视觉模型；管理员全站视觉模型） */
(function (global) {
    'use strict';

    var state = {
        enabled: false,
        authed: false,
        isAdmin: false,
        visionConfigured: false,
        assets: [],
        visualContextId: null,
        polling: {},
        contextDirty: false,
        limits: {
            maxAttachFiles: 4,
            maxBatchFiles: 4
        }
    };

    function $(id) { return document.getElementById(id); }

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
        var root = $('tc-prompt-composer');
        if (!root) return;
        root.classList.toggle('tc-prompt-composer--attach-full', isAttachLimitReached());
    }

    function isAiEntryDrawerActive() {
        var wrap = $('left-content-wrapper');
        if (!wrap) return true;
        return wrap.getAttribute('data-active-drawer') !== '2';
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
        if (!isLeftPanelVisible() || !isAiEntryDrawerActive()) return;
        var chain = Promise.resolve();
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            chain = global.HfAuthNav.fetchMe().then(function (me) {
                applyAuthFromMe(me);
            }).catch(function () {});
        }
        chain.then(function () {
            if (!state.authed) {
                state.visionConfigured = false;
                syncComposerClass();
                return;
            }
            applyVisionFromCache();
            return fetchStatus();
        }).catch(function () {
            syncComposerClass();
        });
    }

    function watchLeftPanelOpen() {
        var panel = $('left-panel');
        if (!panel || panel._tcAttachPanelWatch) return;
        panel._tcAttachPanelWatch = true;
        var lastVisible = false;
        function check() {
            var visible = isLeftPanelVisible() && isAiEntryDrawerActive();
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
            wrapObs.observe(wrap, { attributes: true, attributeFilter: ['data-active-drawer'] });
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
            if (state.authed && !state.isAdmin) return true;
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
                    syncComposerClass();
                    updateMeta();
                    return false;
                }
                state.enabled = !!(d && d.enabled);
                state.visionConfigured = !!(d && d.vision_configured);
                if (d && d.max_attach_files) state.limits.maxAttachFiles = d.max_attach_files;
                if (d && d.max_batch_files) state.limits.maxBatchFiles = d.max_batch_files;
                syncComposerClass();
                updateMeta();
                return state.visionConfigured;
            })
            .catch(function () {
                state.enabled = false;
                state.visionConfigured = false;
                syncComposerClass();
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
            syncComposerClass();
            if (state.visionConfigured) {
                if (openFilePicker) openFilePicker();
                return;
            }
            return ensureVisionConfigured().then(function (configured) {
                if (configured && openFilePicker) openFilePicker();
            });
        });
    }

    function updateMeta() {
        syncComposerClass();
    }

    function renderAttachments() {
        var grid = $('tc-prompt-composer-attachments');
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
                img.alt = '附件';
                card.appendChild(img);
            } else {
                var doc = document.createElement('div');
                doc.className = 'tc-attach-card__doc';
                doc.textContent = isPdf ? 'PDF' : (isTxt ? 'TXT' : 'IMG');
                card.appendChild(doc);
            }

            var badge = document.createElement('div');
            badge.className = 'tc-attach-card__badge';
            if (asset.parse_status === 'error') {
                badge.classList.add('tc-attach-card__badge--error');
                badge.textContent = '失败';
            } else if (asset.parse_status === 'done') {
                badge.textContent = '就绪';
            } else {
                badge.classList.add('tc-attach-card__badge--pending');
                badge.textContent = asset.parse_status === 'processing' ? '解析中' : '等待';
            }
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
        syncComposerClass();
        updateMeta();
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

    function pollAsset(assetId) {
        if (state.polling[assetId]) return;
        state.polling[assetId] = true;
        function tick() {
            fetch('/api/test-cases/attachments/' + encodeURIComponent(assetId), { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    var asset = d && d.asset;
                    if (!asset) return;
                    upsertAsset(asset);
                    if (asset.parse_status === 'pending' || asset.parse_status === 'processing') {
                        setTimeout(tick, 1500);
                        return;
                    }
                    delete state.polling[assetId];
                    tryRebuildContext();
                })
                .catch(function () {
                    delete state.polling[assetId];
                });
        }
        tick();
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

    function uploadFiles(fileList) {
        if (!fileList || !fileList.length) return Promise.resolve();
        return ensureAuthenticatedForUpload().then(function (ok) {
            if (!ok) return;
            return ensureVisionConfigured().then(function (configured) {
                if (!configured) return;
                var picked = pickFilesForUpload(fileList);
                if (!picked.length) return;
                var fd = new FormData();
                for (var i = 0; i < picked.length; i++) {
                    fd.append('files[]', picked[i]);
                }
                state.assets.forEach(function (asset) {
                    if (asset && asset.id) fd.append('existing_asset_ids[]', asset.id);
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
                        (d.assets || []).forEach(function (asset) {
                            if (!asset.thumb_url) {
                                asset.thumb_url = '/api/test-cases/attachments/' + asset.id + '/thumb';
                            }
                            upsertAsset(asset);
                            pollAsset(asset.id);
                        });
                    })
                    .catch(function (err) {
                        toast((err && err.message) || '上传失败', 'error');
                    });
            });
        });
    }

    function removeAsset(assetId) {
        fetch('/api/test-cases/attachments/' + encodeURIComponent(assetId), {
            method: 'DELETE',
            credentials: 'same-origin'
        }).finally(function () {
            state.assets = state.assets.filter(function (a) { return a.id !== assetId; });
            state.contextDirty = true;
            state.visualContextId = null;
            renderAttachments();
            tryRebuildContext();
        });
    }

    function getUserPromptSnippet() {
        var el = $('ai-prompt');
        if (!el) return '';
        return String(el.value || '').trim().slice(0, 500);
    }

    function tryRebuildContext() {
        if (!state.assets.length) {
            state.visualContextId = null;
            updateMeta();
            return Promise.resolve(null);
        }
        var pending = state.assets.some(function (a) {
            return a.parse_status === 'pending' || a.parse_status === 'processing';
        });
        if (pending) return Promise.resolve(null);
        var doneIds = state.assets
            .filter(function (a) { return a.parse_status === 'done'; })
            .map(function (a) { return a.id; })
            .slice(0, getMaxAttachFiles());
        if (!doneIds.length) return Promise.resolve(null);
        return fetch('/api/test-cases/attachments/contexts', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asset_ids: doneIds,
                user_prompt: getUserPromptSnippet(),
                include_in_generation: true
            })
        })
            .then(function (r) {
                return r.json().then(function (d) {
                    if (!r.ok) throw new Error((d && d.error) || '构建上下文失败');
                    return d;
                });
            })
            .then(function (ctx) {
                state.visualContextId = ctx && ctx.id ? ctx.id : null;
                state.contextDirty = false;
                updateMeta();
                return state.visualContextId;
            })
            .catch(function (err) {
                toast((err && err.message) || '附件上下文构建失败', 'warning');
                return null;
            });
    }

    function rebuildContext() {
        state.contextDirty = true;
        return tryRebuildContext();
    }

    function getVisualContextId() {
        return state.visualContextId;
    }

    function hasUploadedAttachments() {
        return state.assets.length > 0;
    }

    function removeLegacyVisualToggleUi() {
        var toggle = $('tc-vri-toggle');
        if (toggle) {
            var label = toggle.closest ? toggle.closest('label') : null;
            if (label) label.parentNode.removeChild(label);
            else toggle.parentNode.removeChild(toggle);
        }
        var composer = $('tc-prompt-composer');
        if (composer) {
            composer.querySelectorAll('label').forEach(function (label) {
                if (/视觉参与/.test(String(label.textContent || ''))) {
                    label.parentNode.removeChild(label);
                }
            });
        }
    }

    function appendPayload(body) {
        if (!body || !hasUploadedAttachments() || !state.visualContextId) return body;
        body.visual_context_id = state.visualContextId;
        return body;
    }

    function applyVisionFromBuiltinAiDetail(d) {
        if (!d) return;
        if (typeof d.vision_configured === 'boolean') {
            state.visionConfigured = d.vision_configured;
            syncComposerClass();
            return;
        }
        if (typeof d.vision_api_base_url !== 'undefined') {
            state.visionConfigured = !!(
                String(d.vision_api_base_url || '').trim() &&
                String(d.vision_api_key || '').trim() &&
                String(d.vision_model || '').trim()
            );
            syncComposerClass();
        }
    }

    function onBuiltinAiPresetChanged(ev) {
        applyVisionFromBuiltinAiDetail(ev && ev.detail);
        fetchStatus();
    }

    function bindEvents() {
        var uploadBtn = $('tc-attach-upload-btn');
        var fileInput = $('tc-attach-file-input');
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

        var box = $('tc-prompt-composer-box');
        if (box) {
            box.addEventListener('dragover', function (e) {
                e.preventDefault();
                if (state.visionConfigured && !isAttachLimitReached()) {
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

        var promptEl = $('ai-prompt');
        if (promptEl) {
            promptEl.addEventListener('blur', function () {
                if (state.assets.length && state.visualContextId) {
                    rebuildContext();
                }
            });
        }

        global.addEventListener('hf-user-ai-config-updated', function (ev) {
            if (state.isAdmin) {
                onBuiltinAiPresetChanged(ev);
                return;
            }
            var d = ev && ev.detail;
            state.visionConfigured = !!(d && d.vision_configured);
            syncComposerClass();
            if (state.visionConfigured) fetchStatus();
        });

        global.addEventListener('hf-builtin-ai-preset-changed', onBuiltinAiPresetChanged);

        global.addEventListener('hf-auth-nav-updated', function (ev) {
            applyAuthFromMe(ev.detail || {});
            syncComposerClass();
            if (state.authed) fetchStatus();
        });
    }

    function init() {
        if (!$('tc-prompt-composer')) return;
        removeLegacyVisualToggleUi();
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
        });
    }

    global.TcVisualAttachments = {
        init: init,
        uploadFiles: uploadFiles,
        getVisualContextId: getVisualContextId,
        appendPayload: appendPayload,
        rebuildContext: rebuildContext,
        hasUploadedAttachments: hasUploadedAttachments,
        isActive: function () { return hasUploadedAttachments(); },
        getAssets: function () { return state.assets.slice(); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
