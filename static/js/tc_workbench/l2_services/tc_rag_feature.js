/**
 * TestHub TC Workbench — L2 SERVICES
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function paintTcRagToggleUi() {
    syncTcRagEnableHint();
    var btn = document.getElementById('tc-rag-toggle-label');
    var el = document.getElementById('tc-rag-enabled');
    if (!btn || !el) return;
    var locked = !isTcRagFeatureUnlocked();
    var on = !!el.checked && !locked;
    btn.classList.toggle('tc-gen-toggle-btn--locked', locked);
    btn.classList.toggle('tc-gen-toggle-btn--on', on);
    btn.classList.toggle('tc-gen-toggle-btn--off', !on && !locked);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function updateTcRagToggleHint(extraHint) {
    var stackOn = typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled();
    var base = stackOn
        ? '开启后检索平台公共知识库；未配蓝湖时仍可用公共库'
        : '开启后检索平台公共知识库；须先填写蓝湖 Cookie 与文档 URL';
    var hint = extraHint ? base + '（' + extraHint + '）' : base;
    var label = document.getElementById('tc-rag-toggle-label');
    if (label) label.title = hint;
    var staticHint = document.getElementById('tc-rag-toggle-static-hint');
    if (staticHint && isTcRagFeatureUnlocked()) {
        staticHint.textContent = hint;
    }
    if (typeof refreshTcRagHelpTip === 'function') refreshTcRagHelpTip();
}

function initTcRagToggle() {
    if (typeof initTcContextStack === 'function') initTcContextStack();
    var el = document.getElementById('tc-rag-enabled');
    var label = document.getElementById('tc-rag-toggle-label');
    if (!el || !label) return;
    el.checked = false;
    paintTcRagToggleUi();
    syncTcRagLockChrome();
    label.addEventListener('click', function(e) {
        e.preventDefault();
        if (!isTcRagFeatureUnlocked()) {
            requestTcFeatureUnlock('rag', function() {
                setTcRagToggleEnabled(true);
            });
            return;
        }
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    el.addEventListener('change', function() {
        if (!isTcRagFeatureUnlocked()) {
            el.checked = false;
            return;
        }
        paintTcRagToggleUi();
        if (el.checked) updateTcRagStatusHint();
        else updateTcRagToggleHint('');
    });
    if (isTcRagFeatureUnlocked()) updateTcRagStatusHint();
}

function updateTcRagStatusHint() {
    fetch('/api/rag/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (typeof applyTcContextStackStatus === 'function') {
                applyTcContextStackStatus(data);
            }
            if (!data.enabled) {
                updateTcRagToggleHint('服务端未启用');
                return;
            }
            var hint = data.available ? '已启用' : '知识库未导入';
            if (isTcContextStackEnabled && isTcContextStackEnabled()) {
                hint = data.available ? '管理员公共库 · 已启用' : '管理员公共库 · 未导入';
            }
            updateTcRagToggleHint(hint);
        })
        .catch(function() {
            updateTcRagToggleHint('');
        });
}

function getTcAiCredentialsForMode(mode) {
    return {
        use_builtin: true,
        base_url: TC_AI_PRESET.baseUrl || '',
        api_key: TC_AI_PRESET.apiKey || '',
        model: TC_AI_PRESET.model || '',
        temperature: TC_AI_PRESET.temperature
    };
}

function fetchTcRagSummarizeQuery(lanhuSummary, mode) {
    var text = String(lanhuSummary || '').trim();
    if (!text) return Promise.resolve('');
    var creds = getTcAiCredentialsForMode(mode);
    var body = {
        text: text,
        use_builtin: !!creds.use_builtin
    };
    if (!creds.use_builtin) {
        body.base_url = creds.base_url;
        body.api_key = creds.api_key;
        body.model = creds.model;
        if (creds.temperature) body.temperature = creds.temperature;
    } else if (creds.temperature) {
        body.temperature = creds.temperature;
    }
    return fetch('/api/rag/summarize-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
        .then(function(response) {
            return response.json().catch(function() {
                console.warn('[TestHub] RAG summarize: 非 JSON 响应 HTTP', response.status);
                return { query: '', error: 'bad response' };
            });
        })
        .then(function(data) {
            if (data.error) {
                console.warn('[TestHub] RAG summarize:', data.error);
                return '';
            }
            return String(data.query != null ? data.query : '').trim();
        })
        .catch(function(err) {
            console.warn('[TestHub] RAG summarize failed:', err && err.message ? err.message : err);
            return '';
        });
}

/**
 * 平台公共库 RAG 检索（RAG 召回勾选时调用）
 */
function fetchTcRagRetrieveContext(queryText, opts) {
    opts = opts || {};
    var q = String(queryText || '').trim();
    var emptyMeta = { context: '', chunks: [] };
    if (!q || !opts.includePublic) {
        return opts.returnMeta ? Promise.resolve(emptyMeta) : Promise.resolve('');
    }
    return fetch('/api/rag/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query: q, include_public: true })
    })
        .then(function(response) {
            return response.json().catch(function() {
                throw new Error('检索知识库失败：服务返回非 JSON（HTTP ' + response.status + '）');
            }).then(function(data) {
                return { response: response, data: data };
            });
        })
        .then(function(wrapped) {
            var response = wrapped.response;
            var data = wrapped.data || {};
            if (response.status === 403) {
                console.warn('[TestHub] RAG retrieve: 403 无公共库权限');
                return opts.returnMeta ? emptyMeta : '';
            }
            if (data.error) {
                console.warn('[TestHub] RAG retrieve:', data.error);
                return opts.returnMeta ? emptyMeta : '';
            }
            var ctx = String(data.context != null ? data.context : '').trim();
            if (opts.returnMeta) {
                return { context: ctx, chunks: data.chunks || [] };
            }
            return ctx;
        })
        .catch(function(err) {
            console.warn('[TestHub] RAG retrieve failed:', err && err.message ? err.message : err);
            return opts.returnMeta ? emptyMeta : '';
        });
}

/** @deprecated 保留别名，仅检索平台公共库 */
function fetchTcLegacyRequirementsSummary(queryText) {
    if (!isTcRagEnabled()) return Promise.resolve('');
    return fetchTcRagRetrieveContext(queryText, { includePublic: true });
}

/** 蓝湖需求 + 平台公共库检索（Context Stack 或 legacy 路径）
 * 单页需求：内存 pageCache → DB tc_lanhu_page_content_cache → 蓝湖 page-chars 兜底 */
function resolveTcGenerateKnowledgeContext(mode, hooks) {
    if (typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled() &&
        typeof resolveTcGenerateKnowledgeContextStack === 'function') {
        return resolveTcGenerateKnowledgeContextStack(mode, hooks);
    }
    if (typeof resolveTcGenerateKnowledgeContextLegacy === 'function') {
        return resolveTcGenerateKnowledgeContextLegacy(mode, hooks);
    }
    hooks = hooks || {};
    return Promise.resolve({ requirements: '', personalContext: '', publicContext: '', ragContext: '', publicChunks: [] });
}

function buildTcComposeOptsFromBundle(bundle) {
    bundle = bundle || {};
    var stackOn = typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled();
    if (stackOn) {
        return {
            contextStackEnabled: true,
            personalContext: bundle.personalContext || '',
            publicContext: bundle.publicContext || '',
            legacyRag: bundle.ragContext || ''
        };
    }
    return { legacyRag: bundle.ragContext || '' };
}

/** 用例生成上下文：蓝湖 → 总结 → 知识库 → 拼装 Prompt */
function resolveTcCaseGenerateContext(userPrompt, mode, hooks, composeFn) {
    hooks = hooks || {};
    hooks.userPrompt = userPrompt;
    return resolveTcGenerateKnowledgeContext(mode, hooks).then(function (bundle) {
        bundle = bundle || {};
        window.TC_LAST_GENERATE_KNOWLEDGE_BUNDLE = bundle;
        var lanhuCreds = typeof getTcLanhuCredentialsForMode === 'function'
            ? getTcLanhuCredentialsForMode(mode) : { cookie: '', url: '' };
        if (typeof tcCaptureGenerationLanhuContext === 'function') {
            tcCaptureGenerationLanhuContext(mode, bundle.requirements);
        }
        tcPendingGenerationProvenance = tcBuildGenerationProvenance(
            bundle.requirements,
            {
                personalContext: bundle.personalContext,
                publicContext: bundle.publicContext,
                publicChunks: bundle.publicChunks,
                personalChunks: bundle.personalChunks,
                ragContext: bundle.ragContext,
                lanhuUrl: lanhuCreds.url || ''
            }
        );
        if (typeof tcEnsurePendingGenerationProvenance === 'function') {
            tcEnsurePendingGenerationProvenance(mode);
        }
        var composeOpts = buildTcComposeOptsFromBundle(bundle);
        return composeFn(userPrompt, bundle.requirements, composeOpts);
    });
}

function resolveListCaseGeneratePrompt(userPrompt, mode, hooks) {
    return resolveTcCaseGenerateContext(userPrompt, mode, hooks, function(up, req, opts) {
        var composeOpts = Object.assign({ mindmap: false }, opts || {});
        if (typeof getTcPreviousGenUserPrompts === 'function') {
            composeOpts.previousUserPrompts = getTcPreviousGenUserPrompts();
        }
        return composeTcAiGeneratePrompt(up, req, composeOpts);
    });
}

/** 导图用例生成：蓝湖 → 总结 → RAG → 独立导图 Prompt（不含表头/历史输入） */
function resolveMindmapCaseGeneratePrompt(userPrompt, mode, hooks) {
    return resolveTcCaseGenerateContext(userPrompt, mode, hooks, function(up, req, opts) {
        return composeMindmapCaseGeneratePrompt(up, req, mode, opts || {});
    });
}

var TC_LANHU_MODULE_GEN_MIN_CHARS = (typeof window.TC_LANHU_MODULE_GEN_MIN_CHARS === 'number'
    && window.TC_LANHU_MODULE_GEN_MIN_CHARS > 0) ? window.TC_LANHU_MODULE_GEN_MIN_CHARS : 2000;
var _tcLanhuPageCacheDbInflight = null;
var _tcLanhuPageCacheDbDocId = '';

function getTcLanhuDocIdForPageCache() {
    if (typeof window.getTcLanhuDocTreeMeta === 'function') {
        var meta = window.getTcLanhuDocTreeMeta() || {};
        var docId = String(meta.docId || '').trim();
        if (docId) return docId;
    }
    return '';
}

function resolveTcLanhuPageIdFromUrlOrOpts(lanhuUrl, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var pageId = String(opts.page_id || opts.pageId || '').trim();
    if (!pageId) {
        var pageMatch = String(lanhuUrl || '').match(/[?&]pageId=([^&]+)/i);
        if (pageMatch && pageMatch[1]) {
            try { pageId = decodeURIComponent(pageMatch[1]); } catch (ePage) { pageId = pageMatch[1]; }
        }
    }
    return pageId;
}

function tcLanhuUseModulePipelineFromChars(chars) {
    var n = parseInt(chars, 10);
    if (isNaN(n) || n < 0) n = 0;
    return n >= TC_LANHU_MODULE_GEN_MIN_CHARS;
}

function applyTcLanhuFetchMetaFromChars(chars) {
    var n = parseInt(chars, 10);
    if (isNaN(n) || n < 0) n = 0;
    window.TC_LAST_LANHU_PAGE_TEXT_CHARS = n > 0 ? n : 0;
    window.TC_LAST_LANHU_USE_MODULE_PIPELINE = tcLanhuUseModulePipelineFromChars(n);
}

function applyTcLanhuFetchMeta(data) {
    data = data || {};
    if (data.from_cache) {
        applyTcLanhuFetchMetaFromChars(data.page_text_chars);
        return;
    }
    var chars = parseInt(data.page_text_chars, 10);
    window.TC_LAST_LANHU_PAGE_TEXT_CHARS = (!isNaN(chars) && chars > 0) ? chars : 0;
    window.TC_LAST_LANHU_USE_MODULE_PIPELINE = !!data.use_module_pipeline;
}

function resetTcLanhuFetchMeta() {
    window.TC_LAST_LANHU_PAGE_TEXT_CHARS = 0;
    window.TC_LAST_LANHU_USE_MODULE_PIPELINE = false;
}

function readTcLanhuPageCacheFromMemory(pageId) {
    pageId = String(pageId || '').trim();
    if (!pageId || typeof window.getTcLanhuPageCacheEntry !== 'function') return null;
    var entry = window.getTcLanhuPageCacheEntry(pageId);
    if (!entry || entry.loading || entry.error) return null;
    var text = String(entry.text || '').trim();
    if (!text) return null;
    var chars = parseInt(entry.chars, 10);
    if (isNaN(chars) || chars < 0) chars = text.length;
    return { text: text, chars: chars, source: 'memory' };
}

function fetchTcLanhuPageCacheFromDb(docId, pageId) {
    docId = String(docId || '').trim();
    pageId = String(pageId || '').trim();
    if (!docId || !pageId) return Promise.resolve(null);
    if (_tcLanhuPageCacheDbInflight && _tcLanhuPageCacheDbDocId === docId) {
        return _tcLanhuPageCacheDbInflight.then(function (items) {
            items = items || [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item && String(item.page_id || '') === pageId) {
                    var text = String(item.content_text || '').trim();
                    if (!text) return null;
                    var chars = parseInt(item.content_chars, 10);
                    if (isNaN(chars) || chars < 0) chars = text.length;
                    return { text: text, chars: chars, source: 'db' };
                }
            }
            return null;
        });
    }
    _tcLanhuPageCacheDbDocId = docId;
    _tcLanhuPageCacheDbInflight = fetch('/api/lanhu-page-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ doc_id: docId })
    }).then(function (response) {
        return response.json().catch(function () { return { items: [] }; });
    }).then(function (data) {
        return (data && data.items) ? data.items : [];
    }).catch(function () {
        return [];
    }).finally(function () {
        _tcLanhuPageCacheDbInflight = null;
        _tcLanhuPageCacheDbDocId = '';
    });
    return _tcLanhuPageCacheDbInflight.then(function (items) {
        items = items || [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item && String(item.page_id || '') === pageId) {
                var text = String(item.content_text || '').trim();
                if (!text) return null;
                var chars = parseInt(item.content_chars, 10);
                if (isNaN(chars) || chars < 0) chars = text.length;
                return { text: text, chars: chars, source: 'db' };
            }
        }
        return null;
    });
}

function resolveTcLanhuRequirementsFromCache(pageId, docId) {
    pageId = String(pageId || '').trim();
    if (!pageId) return Promise.resolve(null);
    var mem = readTcLanhuPageCacheFromMemory(pageId);
    if (mem) return Promise.resolve(mem);
    return fetchTcLanhuPageCacheFromDb(docId, pageId);
}

function fetchTcLanhuRequirementsSummaryLive(lanhuCookie, lanhuUrl, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var pageId = resolveTcLanhuPageIdFromUrlOrOpts(lanhuUrl, opts);
    var docId = String(opts.doc_id || opts.docId || getTcLanhuDocIdForPageCache() || '').trim();
    if (pageId) {
        return fetch('/api/lanhu-page-chars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                lanhu_cookie: lanhuCookie,
                lanhu_url: lanhuUrl,
                page_id: pageId,
                doc_id: docId,
                page_name: String(opts.page_name || '').trim()
            })
        }).then(function (response) {
            return response.json().catch(function () {
                throw new Error('获取蓝湖页面需求失败：服务返回非 JSON（HTTP ' + response.status + '）');
            });
        }).then(function (data) {
            if (data.error) throw new Error(data.error);
            var text = String(data.page_text || '').trim();
            var chars = parseInt(data.page_text_chars, 10);
            if (isNaN(chars) || chars < 0) chars = text.length;
            applyTcLanhuFetchMetaFromChars(chars);
            return text;
        });
    }
    var body = { lanhu_cookie: lanhuCookie, lanhu_url: lanhuUrl };
    return fetch('/api/lanhu-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (response) {
        return response.json().catch(function () {
            throw new Error('获取蓝湖需求失败：服务返回非 JSON（HTTP ' + response.status + '）');
        });
    }).then(function (data) {
        if (data.error) throw new Error(data.error);
        applyTcLanhuFetchMeta(data);
        return String(data.summary != null ? data.summary : '').trim();
    });
}

function fetchTcLanhuRequirementsSummary(lanhuCookie, lanhuUrl, opts) {
    if (!lanhuCookie || !lanhuUrl) {
        resetTcLanhuFetchMeta();
        return Promise.resolve('');
    }
    opts = opts && typeof opts === 'object' ? opts : {};
    var pageId = resolveTcLanhuPageIdFromUrlOrOpts(lanhuUrl, opts);
    var docId = String(opts.doc_id || opts.docId || getTcLanhuDocIdForPageCache() || '').trim();
    if (!pageId) {
        return fetchTcLanhuRequirementsSummaryLive(lanhuCookie, lanhuUrl, opts);
    }
    return resolveTcLanhuRequirementsFromCache(pageId, docId).then(function (cached) {
        if (cached && cached.text) {
            applyTcLanhuFetchMetaFromChars(cached.chars);
            return cached.text;
        }
        return fetchTcLanhuRequirementsSummaryLive(lanhuCookie, lanhuUrl, opts);
    });
}

function buildTableRowsSnippetFromIndices(indices) {
    if (!indices || !indices.length) return '(空)';
    return indices.map(function(i) {
        const row = testCasesData[i] || [];
        return tableColumns.map(function(col, j) {
            return col + ': ' + (row[j] != null ? String(row[j]) : '');
        }).join(' | ');
    }).join('\n');
}

/** 内网预设：运行时缓存，来源为 GET /api/builtin-ai/config（MySQL） */
var TC_AI_PRESET = {
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: '0.1'
};

function applyTcAiPresetToObject(cfg, skipEvent) {
    if (!cfg) return;
    if (cfg.base_url) TC_AI_PRESET.baseUrl = cfg.base_url;
    if (cfg.api_key != null) TC_AI_PRESET.apiKey = cfg.api_key;
    if (cfg.model) TC_AI_PRESET.model = cfg.model;
    if (cfg.temperature != null) TC_AI_PRESET.temperature = String(cfg.temperature);
    if (!skipEvent) {
        document.dispatchEvent(new CustomEvent('th-ai-preset-updated', { detail: cfg }));
    }
}

function syncTcPresetModelSummary() {
    ['tc-preset-model-summary', 'ctm-preset-model-summary'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    });
}

function loadTcAiPresetFromServer() {
    function applyUserOrBuiltin(userData, me) {
        if (userData && userData.configured) {
            applyTcAiPresetToObject(userData);
            syncTcPresetModelSummary();
            return userData;
        }
        if (me && me.can_manage_builtin_ai) {
            return fetch('/api/builtin-ai/config', { credentials: 'same-origin' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    applyTcAiPresetToObject(data);
                    syncTcPresetModelSummary();
                    return data;
                });
        }
        applyTcAiPresetToObject(userData || {});
        syncTcPresetModelSummary();
        return userData;
    }
    var mePromise = (window.HfAuthNav && window.HfAuthNav.fetchMe)
        ? window.HfAuthNav.fetchMe()
        : fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    return mePromise.then(function (me) {
        if (!me || !me.authenticated) {
            applyTcAiPresetToObject({});
            syncTcPresetModelSummary();
            return null;
        }
        return fetch('/api/user-ai-config', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (userData) { return applyUserOrBuiltin(userData, me); });
    });
}

function saveTcAiPresetToServer(baseUrl, apiKey, model) {
    var temp = parseFloat(TC_AI_PRESET.temperature);
    if (isNaN(temp)) temp = 0.1;
    return fetch('/api/user-ai-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            base_url: baseUrl,
            api_key: apiKey,
            model: model,
            temperature: temp
        })
    }).then(function(r) {
        return r.json().then(function(data) {
            if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
            applyTcAiPresetToObject({ base_url: baseUrl, api_key: apiKey, model: model, temperature: temp });
            if (window.HfUserAiConfig && window.HfUserAiConfig.loadConfig) {
                window.HfUserAiConfig.loadConfig(true);
            }
            return data;
        });
    });
}

function openTcPresetModelModal() {
    var modal = document.getElementById('tc-preset-model-modal');
    var urlInp = document.getElementById('tc-preset-modal-base-url');
    var keyInp = document.getElementById('tc-preset-modal-api-key');
    var modelInp = document.getElementById('tc-preset-modal-model');
    if (!modal || !urlInp || !keyInp || !modelInp) return;
    if (modal.parentNode !== document.body) document.body.appendChild(modal);

    loadTcAiPresetFromServer()
        .catch(function() { /* 沿用已加载的 TC_AI_PRESET */ })
        .finally(function() {
            urlInp.value = TC_AI_PRESET.baseUrl || '';
            keyInp.value = TC_AI_PRESET.apiKey || '';
            modelInp.value = TC_AI_PRESET.model || '';
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.style.overflow = 'hidden';
            urlInp.focus();
        });
}

function closeTcPresetModelModal() {
    var modal = document.getElementById('tc-preset-model-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    document.body.style.overflow = '';
}

function initTcPresetModelSettingsUi() {
    loadTcAiPresetFromServer().catch(function() { /* 首次失败时生成仍会在保存后可用 */ });

    var cancelBtn = document.getElementById('tc-preset-model-cancel-btn');
    var saveBtn = document.getElementById('tc-preset-model-save-btn');
    var modal = document.getElementById('tc-preset-model-modal');
    if (cancelBtn) cancelBtn.addEventListener('click', closeTcPresetModelModal);
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTcPresetModelModal();
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            var urlInp = document.getElementById('tc-preset-modal-base-url');
            var keyInp = document.getElementById('tc-preset-modal-api-key');
            var modelInp = document.getElementById('tc-preset-modal-model');
            var baseUrl = (urlInp && urlInp.value || '').trim();
            var apiKey = (keyInp && keyInp.value || '').trim();
            var model = (modelInp && modelInp.value || '').trim();
            if (!baseUrl || !apiKey || !model) {
                tcAppAlert('请填写 API 地址、API Key 与模型名称。', { variant: 'warning', title: '参数不完整' });
                return;
            }
            saveBtn.disabled = true;
            saveTcAiPresetToServer(baseUrl, apiKey, model)
                .then(function(data) {
                    applyTcAiPresetToObject(data);
                    syncTcPresetModelSummary();
                    closeTcPresetModelModal();
                    tcAppToast('内网模型连接已保存到服务器。', { variant: 'success', duration: 2800 });
                })
                .catch(function(err) {
                    tcAppAlert((err && err.message) || '保存失败', { variant: 'error', title: '保存失败' });
                })
                .finally(function() { saveBtn.disabled = false; });
        });
    }
    document.addEventListener('keydown', function tcPresetModelEsc(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('flex')) closeTcPresetModelModal();
    });
}

var TC_FEATURE_UNLOCK_PASSWORD = String(window.__TESTHUB_FEATURE_UNLOCK_PASSWORD__ || '').trim();
var TC_FEATURE_UNLOCK_STATE = { preset: false, rag: false };
var tcFeatureUnlockPending = null;

function isTcFeatureUnlocked(feature) {
    if (feature === 'rag') return isTcRagFeatureUnlocked();
    if (typeof hfToolkitFeatureUsable === 'function' && hfToolkitFeatureUsable()) return true;
    return !!TC_FEATURE_UNLOCK_STATE[feature];
}

function tcFeatureUnlockFlagName(feature) {
    if (feature === 'preset') return 'tc_preset';
    if (feature === 'rag') return 'tc_rag';
    return 'tc_' + feature;
}

function setTcFeatureUnlocked(feature, unlocked) {
    TC_FEATURE_UNLOCK_STATE[feature] = !!unlocked;
    hfToolkitSetUnlockFlag(tcFeatureUnlockFlagName(feature), unlocked);
    syncTcFeatureLockChrome();
    if (feature === 'rag' && !unlocked && typeof setTcRagToggleEnabled === 'function') {
        setTcRagToggleEnabled(false);
    }
}

function resetTcFeatureUnlockState() {
    TC_FEATURE_UNLOCK_STATE.preset = false;
    TC_FEATURE_UNLOCK_STATE.rag = false;
    tcFeatureUnlockPending = null;
    closeTcFeatureUnlockModal();
    syncTcFeatureLockChrome();
}

function initTcFeatureUnlockLockedState() {
    if (typeof hfToolkitFeatureUsable === 'function' && hfToolkitFeatureUsable()) {
        setTcFeatureUnlocked('preset', true);
        tcFeatureUnlockPending = null;
        syncTcFeatureLockChrome();
        return;
    }
    TC_FEATURE_UNLOCK_STATE.preset = false;
    TC_FEATURE_UNLOCK_STATE.rag = false;
    tcFeatureUnlockPending = null;
    hfToolkitSetUnlockFlag('tc_preset', false);
    hfToolkitSetUnlockFlag('tc_rag', false);
    syncTcFeatureLockChrome();
}

function syncTcFeatureLockChrome() {
    var presetLock = document.getElementById('ai-config-mode-preset-lock');
    var presetBtn = document.getElementById('ai-config-mode-preset-btn');
    var presetUnlocked = isTcFeatureUnlocked('preset');
    if (presetLock) presetLock.classList.toggle('hidden', presetUnlocked);
    if (presetBtn) presetBtn.setAttribute('aria-disabled', presetUnlocked ? 'false' : 'true');
    if (typeof syncTcRagLockChrome === 'function') syncTcRagLockChrome();
    if (window.ThAiConfigBridge && typeof window.ThAiConfigBridge.syncPresetLockChrome === 'function') {
        window.ThAiConfigBridge.syncPresetLockChrome();
    }
}

window.syncTcFeatureLockChrome = syncTcFeatureLockChrome;

function closeTcFeatureUnlockModal() {
    tcFeatureUnlockPending = null;
    var m = document.getElementById('tc-feature-unlock-modal');
    var inp = document.getElementById('tc-feature-unlock-password');
    if (inp) inp.value = '';
    if (m) {
        m.classList.add('hidden');
        m.classList.remove('flex');
    }
    document.body.style.overflow = '';
}

function openTcFeatureUnlockModal(feature, onSuccess) {
    if (typeof ensureTcWorkbenchOverlaysMounted === 'function') ensureTcWorkbenchOverlaysMounted();
    var m = document.getElementById('tc-feature-unlock-modal');
    var titleEl = document.getElementById('tc-feature-unlock-modal-title');
    var descEl = document.getElementById('tc-feature-unlock-modal-desc');
    var inp = document.getElementById('tc-feature-unlock-password');
    if (!m || !inp) {
        if (onSuccess) onSuccess();
        return;
    }
    if (m.parentNode !== document.body) document.body.appendChild(m);
    tcFeatureUnlockPending = { feature: feature, onSuccess: onSuccess };
    if (titleEl) {
        titleEl.textContent = feature === 'rag'
                ? 'RAG召回已锁定'
                : '内网预设已锁定';
    }
    if (descEl) {
        descEl.textContent = feature === 'rag'
                ? '请输入密码后开启 RAG 召回；刷新或离开本页后需重新解锁。'
                : '请输入密码后才能使用内网预设与相关 AI 生成。';
    }
    m.classList.remove('hidden');
    m.classList.add('flex');
    document.body.style.overflow = 'hidden';
    inp.value = '';
    setTimeout(function() { inp.focus(); }, 50);
}

function requestTcFeatureUnlock(feature, onSuccess) {
    if (isTcFeatureUnlocked(feature)) {
        if (onSuccess) onSuccess();
        return;
    }
    openTcFeatureUnlockModal(feature, onSuccess);
}

function initTcFeatureUnlockUi() {
    if (window._tcFeatureUnlockUiBound) {
        if (typeof initTcFeatureUnlockLockedState === 'function') initTcFeatureUnlockLockedState();
        return;
    }
    window._tcFeatureUnlockUiBound = true;
    var m = document.getElementById('tc-feature-unlock-modal');
    var inp = document.getElementById('tc-feature-unlock-password');
    var submit = document.getElementById('tc-feature-unlock-submit');
    var cancel = document.getElementById('tc-feature-unlock-cancel');
    if (cancel) cancel.addEventListener('click', closeTcFeatureUnlockModal);
    if (m) {
        m.addEventListener('click', function(e) {
            if (e.target === m) closeTcFeatureUnlockModal();
        });
    }
    if (submit) {
        submit.addEventListener('click', function() {
            var pending = tcFeatureUnlockPending;
            if (!pending) return;
            var pwd = (inp && inp.value || '').trim();
            if (!TC_FEATURE_UNLOCK_PASSWORD || pwd !== TC_FEATURE_UNLOCK_PASSWORD) {
                hfUnlockFailToast(TC_FEATURE_UNLOCK_PASSWORD ? '密码错误，请重试' : '未配置解锁密码');
                if (inp) inp.focus();
                return;
            }
            setTcFeatureUnlocked(pending.feature, true);
            closeTcFeatureUnlockModal();
            var cb = pending.onSuccess;
            var feat = pending.feature;
            tcFeatureUnlockPending = null;
            if (feat === 'rag') {
                tcAppToast('RAG 召回已解锁，可点击按钮开启。', { variant: 'success', duration: 2800 });
            }
            if (cb) cb();
        });
    }
    if (inp) {
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (submit) submit.click();
            }
            if (e.key === 'Escape') closeTcFeatureUnlockModal();
        });
    }
    document.addEventListener('keydown', function tcFeatureUnlockEsc(e) {
        if (e.key === 'Escape' && m && m.classList.contains('flex')) closeTcFeatureUnlockModal();
    });
    var presetBtn = document.getElementById('ai-config-mode-preset-btn');
    if (presetBtn) {
        presetBtn.addEventListener('click', function() {
            if (typeof switchAiConfigMode === 'function') switchAiConfigMode('preset');
        });
    }
    hfToolkitClearUnlockStorage();
    initTcFeatureUnlockLockedState();
}

window.__thTcAi = {
    switchMode: switchAiConfigMode,
    isPresetUnlocked: function() { return isTcFeatureUnlocked('preset'); },
    requestPresetUnlock: function(cb) { requestTcFeatureUnlock('preset', cb); },
    applyPreset: applyTcAiPresetToObject,
    getPreset: function() { return TC_AI_PRESET; }
};

document.addEventListener('th-request-preset-unlock', function(ev) {
    requestTcFeatureUnlock('preset', ev.detail && ev.detail.callback);
});
document.addEventListener('th-ai-preset-updated', function(ev) {
    applyTcAiPresetToObject(ev.detail, true);
    syncTcPresetModelSummary();
});
document.addEventListener('th-ai-config-alert', function(ev) {
    var detail = ev.detail || {};
    tcAppAlert(detail.message || '参数不完整', {
        variant: 'warning',
        title: detail.title || '提示'
    });
});
document.addEventListener('th-ai-config-toast', function(ev) {
    var detail = ev.detail || {};
    tcAppToast(detail.message || '已保存', { variant: 'success', duration: 2800 });
});

/** 内网预设提示词草稿（仅当前页内存，刷新清空） */
var tcAiPromptDrafts = { preset: '' };

function getTcAiPromptEl() {
    return document.getElementById('ai-prompt');
}

function saveTcAiPromptDraftForMode(mode) {
    var el = getTcAiPromptEl();
    if (!el) return;
    tcAiPromptDrafts.preset = el.value;
}

function loadTcAiPromptDraftForMode(mode) {
    var el = getTcAiPromptEl();
    if (!el) return;
    el.value = tcAiPromptDrafts.preset || '';
    if (typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(el);
    } else if (typeof autoResizeTextarea === 'function') {
        autoResizeTextarea(el, 36, 118);
    }
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
}

function clearTcAiPromptDrafts() {
    tcAiPromptDrafts = { preset: '' };
    var el = getTcAiPromptEl();
    if (el) el.value = '';
    if (typeof resizeTcAiPromptInput === 'function') resizeTcAiPromptInput(el);
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
}

function clearTcAiPromptDraftForMode(mode) {
    tcAiPromptDrafts.preset = '';
    var el = getTcAiPromptEl();
    if (el) el.value = '';
    if (el && typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(el);
    } else if (el && typeof autoResizeTextarea === 'function') {
        autoResizeTextarea(el, 36, 118);
    }
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
}

function syncTcAiClearButtonsVisibility(mode) {
    var btnPreset = document.getElementById('clear-ai-form-preset');
    if (btnPreset) btnPreset.classList.remove('hidden');
}

function normalizeTcAiTemperatureInput(el, silent) {
    if (!el) return true;
    var raw = String(el.value || '').trim();
    if (!raw) {
        el.setCustomValidity('');
        return true;
    }
    var num = parseFloat(raw);
    if (Number.isNaN(num)) {
        el.setCustomValidity('请输入 0～2 之间的数字，或留空');
        if (!silent && el.reportValidity) el.reportValidity();
        return false;
    }
    if (num < 0 || num > 2) {
        el.setCustomValidity('Temperature 须在 0～2 之间');
        if (!silent && el.reportValidity) el.reportValidity();
        return false;
    }
    el.setCustomValidity('');
    var rounded = Math.round(num * 10) / 10;
    if (String(el.value) !== String(rounded)) el.value = String(rounded);
    return true;
}

function initTcAiTemperatureInput() {
    var el = document.getElementById('ai-temperature');
    if (!el || el._tcTempBound) return;
    el._tcTempBound = true;
    el.addEventListener('input', function() {
        var raw = String(el.value || '').trim();
        if (!raw || raw === '-' || raw === '.') return;
        var num = parseFloat(raw);
        if (Number.isNaN(num)) return;
        if (num > 2) el.value = '2';
        else if (num < 0) el.value = '0';
    });
    el.addEventListener('blur', function() {
        normalizeTcAiTemperatureInput(el, false);
    });
}

function initTcAiPromptIsolation() {
    var el = getTcAiPromptEl();
    if (!el || el._tcPromptIsolationBound) return;
    el._tcPromptIsolationBound = true;
    ['tc_ai_prompt_v1', 'tc_ai_prompt_preset', 'tc_ai_prompt_custom'].forEach(function(k) {
        try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
    clearTcAiPromptDrafts();
    el.setAttribute('autocomplete', 'off');
}

function getAiConfigMode() {
    return 'preset';
}



function isTcEntryLoggedInAuth() {
    var root = document.getElementById('ai-config-mode-root');
    return !!(root && root.getAttribute('data-tc-entry-auth') === 'logged-in');
}

function syncTcAiEntryAuthLayout(me) {
    var root = document.getElementById('ai-config-mode-root');
    if (!root) return;
    var authed = !!(me && me.authenticated);
    root.setAttribute('data-tc-entry-auth', authed ? 'logged-in' : 'guest');
    if (typeof switchAiConfigMode === 'function') {
        switchAiConfigMode('preset', true);
    }
    if (typeof isCollapsed !== 'undefined' && !isCollapsed && typeof tcLeftFloatRefreshContentHeights === 'function') {
        tcLeftFloatRefreshContentHeights();
    }
}
window.syncTcAiEntryAuthLayout = syncTcAiEntryAuthLayout;

(function initTcAiEntryAuthLayout() {
    var root = document.getElementById('ai-config-mode-root');
    if (!root) return;
    document.addEventListener('hf-auth-nav-updated', function (ev) {
        syncTcAiEntryAuthLayout(ev.detail);
    });
    function bootAuthLayout() {
        syncTcAiEntryAuthLayout(null);
        if (window.HfAuthNav && window.HfAuthNav.fetchMe) {
            window.HfAuthNav.fetchMe().then(syncTcAiEntryAuthLayout).catch(function () {
                syncTcAiEntryAuthLayout(null);
            });
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootAuthLayout);
    } else {
        bootAuthLayout();
    }
})();

function syncTcAiLanhuSectionTitle() {
    var titleEl = document.getElementById('tc-ai-lanhu-section-title');
    if (!titleEl) return;
    titleEl.textContent = '蓝湖需求';
}

function syncAiConfigModeSegButtons(activeMode) {
    /* 自定义模式已移除，保留空函数避免调用方报错 */
}

function switchAiConfigMode(mode, skipUnlockCheck, forceSwitch) {
    if (!forceSwitch && typeof isTcLeftPanelNavLocked === 'function' && isTcLeftPanelNavLocked()) {
        if (typeof tcAppToast === 'function') {
            tcAppToast('生成进行中，无法切换配置', { variant: 'warning', duration: 2800 });
        }
        return;
    }
    var prevMode = getAiConfigMode();
    saveTcAiPromptDraftForMode(prevMode);
    if (!skipUnlockCheck && !isTcFeatureUnlocked('preset')) {
        requestTcFeatureUnlock('preset', function() {
            switchAiConfigMode('preset', true);
        });
        return;
    }
    var root = document.getElementById('ai-config-mode-root');
    var presetPanel = document.getElementById('ai-config-preset-panel');
    if (!root || !presetPanel) return;
    root.setAttribute('data-mode', 'preset');
    var presetGenWrap = document.getElementById('tc-generate-preset-wrap');
    presetPanel.classList.remove('hidden');
    if (presetGenWrap) presetGenWrap.classList.remove('hidden');
    syncTcAiClearButtonsVisibility('preset');
    syncTcPresetModelSummary();
    if (typeof autoGrowTcPresetLanhuField === 'function') {
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
    }
    syncTcAiLanhuSectionTitle();
    if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.remountLanhuTooldeckControls === 'function') {
        window.TcWorkbenchEnhancements.remountLanhuTooldeckControls();
    }
    loadTcAiPromptDraftForMode('preset');
    if (!isCollapsed && typeof tcLeftFloatRefreshContentHeights === 'function') {
        tcLeftFloatRefreshContentHeights();
    }
    if (!isCollapsed && typeof tcLeftFloatAdaptContentToPanel === 'function') {
        tcLeftFloatAdaptContentToPanel();
    }
    if (window.TcLeftPanelLock && typeof window.TcLeftPanelLock.applyLockUi === 'function') {
        window.TcLeftPanelLock.applyLockUi();
    } else {
        syncAiConfigModeSegButtons('preset');
    }
    if (typeof syncTcFeatureLockChrome === 'function') syncTcFeatureLockChrome();
}

function getTcGenerateActionButtons() {
    return ['generate-test-cases', 'generate-test-cases-preset-mindmap']
        .map(function(id) { return document.getElementById(id); })
        .filter(Boolean);
}

/**
 * scope: legacy_freeform | append_selected | append_whole | rewrite_selected
 * options.outputTarget: list | mindmap（导图生成成功后自动切换右侧思维导图）
 */
