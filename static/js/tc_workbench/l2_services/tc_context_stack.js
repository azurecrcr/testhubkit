/**
 * TestHub TC Workbench — L2 Context Stack
 * 上下文（蓝湖 + 平台公共 RAG）；CONTEXT_STACK_ENABLED 关闭时走 legacy 路径。
 */
var TC_CONTEXT_STACK_ENABLED = false;
var TC_USER_CAN_PUBLIC_RAG = false;
var TC_LAST_PUBLIC_RAG_CHUNKS = [];

function isTcContextStackEnabled() {
    return !!TC_CONTEXT_STACK_ENABLED;
}

function isTcPublicRagAdmin() {
    return !!TC_USER_CAN_PUBLIC_RAG;
}

function tcPublicRagAdminUnlocked() {
    if (!TC_ADMIN_RAG_NO_PASSWORD) return false;
    if (isTcPublicRagAdmin()) return true;
    if (window._tcConnectRagIsAdmin === true) return true;
    return false;
}
var TC_ADMIN_RAG_NO_PASSWORD = true;

function applyTcContextStackStatus(data) {
    data = data || {};
    TC_CONTEXT_STACK_ENABLED = !!data.context_stack_enabled;
    TC_USER_CAN_PUBLIC_RAG = !!data.user_can_use_public_rag;
    TC_ADMIN_RAG_NO_PASSWORD = data.admin_rag_no_password !== false;
    if (typeof syncTcRagVisibilityForRole === 'function') syncTcRagVisibilityForRole();
    if (typeof syncTcRagLockChrome === 'function') syncTcRagLockChrome();
}

function syncTcRagVisibilityForRole() {
    var label = document.getElementById('tc-rag-toggle-label');
    if (!label) return;
    var wrap = label.closest('.tc-gen-option-item');
    if (!wrap) return;
    var hide = isTcContextStackEnabled() && !isTcPublicRagAdmin();
    wrap.classList.toggle('hidden', hide);
    if (hide) {
        wrap.setAttribute('aria-hidden', 'true');
        if (typeof setTcRagToggleEnabled === 'function') setTcRagToggleEnabled(false);
    } else {
        wrap.removeAttribute('aria-hidden');
    }
}

function fetchTcContextStackStatus() {
    return fetch('/api/rag/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            applyTcContextStackStatus(data);
            return data;
        })
        .catch(function() {
            applyTcContextStackStatus({});
            return null;
        });
}

function initTcContextStack() {
    // 延后拉取，避免首屏与会话/蓝湖接口争抢 worker（Chroma 冷启动约 0.8–1.5s）
    var run = function () { fetchTcContextStackStatus(); };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 1500 });
    } else {
        setTimeout(run, 500);
    }
}

function resolveTcQueryForRetrieval(reqSummary, mode, userPrompt) {
    var summary = String(reqSummary || '').trim();
    var prompt = String(userPrompt || '').trim();
    if (summary) {
        return fetchTcRagSummarizeQuery(summary, mode).then(function(q) {
            var query = String(q || '').trim();
            return query || summary.slice(0, 500);
        });
    }
    return Promise.resolve(prompt);
}

function tcApplyBudgetToBundle(bundle, stage) {
    bundle = bundle || {};
    if (typeof tcAllocateContextLayers !== 'function') return bundle;
    var allocated = tcAllocateContextLayers({
        requirements: { text: bundle.requirements || '', chunks: [] },
        personal: { text: '', chunks: [] },
        public: { text: bundle.publicContext || '', chunks: bundle.publicChunks || [] }
    }, stage || 'module');
    var layers = allocated.layers || {};
    bundle.requirements = (layers.requirements && layers.requirements.text) || bundle.requirements || '';
    bundle.personalContext = '';
    bundle.publicContext = (layers.public && layers.public.text) || '';
    bundle.personalChunks = [];
    bundle.publicChunks = (layers.public && layers.public.chunks) || bundle.publicChunks || [];
    bundle.ragContext = bundle.publicContext || '';
    bundle.contextBudget = allocated.budget;
    return bundle;
}

function emitTcRagContextCheck(hooks, ragEnabled, validateEnabled) {
    if (hooks && typeof hooks.onRagContextCheck === 'function') {
        hooks.onRagContextCheck(!!ragEnabled, !!validateEnabled);
    } else if (hooks && typeof hooks.onRagCheck === 'function') {
        hooks.onRagCheck(!!ragEnabled);
    }
}

function emitTcRagContextDone(hooks, info) {
    info = info || {};
    if (hooks && typeof hooks.onRagContextDone === 'function') {
        hooks.onRagContextDone(info);
    } else if (hooks && typeof hooks.onLegacyDone === 'function') {
        hooks.onLegacyDone(!!info.hit);
    }
}

function emitTcLanhuDone(hooks, ok) {
    if (hooks && typeof hooks.onLanhuDone === 'function') {
        hooks.onLanhuDone(!!ok);
    }
}

function fetchTcLanhuRequirementsWithHooks(creds, hooks) {
    if (hooks && typeof hooks.onLanhuStart === 'function') {
        hooks.onLanhuStart();
    }
    var pageName = '';
    if (typeof window.getTcLanhuDocTreeMeta === 'function') {
        var meta = window.getTcLanhuDocTreeMeta() || {};
        pageName = String(meta.selectedPageName || '').trim();
    }
    return fetchTcLanhuRequirementsSummary(creds.cookie, creds.url, {
        page_id: creds.page_id || '',
        doc_id: (typeof getTcLanhuDocIdForPageCache === 'function' ? getTcLanhuDocIdForPageCache() : ''),
        page_name: pageName
    })
        .then(function(summary) {
            emitTcLanhuDone(hooks, true);
            return summary;
        })
        .catch(function(err) {
            emitTcLanhuDone(hooks, false);
            throw err;
        });
}

/** legacy：仅平台公共 RAG（勾选 RAG 召回时） */
function resolveTcGenerateKnowledgeContextLegacy(mode, hooks) {
    hooks = hooks || {};
    var validateEnabled = !!hooks.validateEnabled;
    var creds = getTcLanhuCredentialsForMode(mode);
    var hasLanhu = !!(creds.cookie && creds.url);
    var hasPublic = isTcRagEnabled();

    function finishBundle(reqSummary, ragCtx) {
        return {
            requirements: String(reqSummary || '').trim(),
            personalContext: '',
            publicContext: String(ragCtx || '').trim(),
            ragContext: String(ragCtx || '').trim(),
            publicChunks: [],
            personalChunks: [],
            query: ''
        };
    }

    function runRetrieval(query) {
        if (!hasPublic) return Promise.resolve('');
        if (hooks.onLegacyStart) hooks.onLegacyStart();
        return fetchTcRagRetrieveContext(query, { includePublic: true });
    }

    function runRagPipeline(reqSummary) {
        reqSummary = String(reqSummary || '').trim();
        emitTcRagContextCheck(hooks, hasPublic, validateEnabled);
        if (!hasPublic) {
            emitTcRagContextDone(hooks, {
                hit: false,
                ragEnabled: false,
                validateEnabled: validateEnabled,
                skipReason: '未开启 RAG'
            });
            return Promise.resolve(finishBundle(reqSummary, ''));
        }
        if (hasLanhu && reqSummary) {
            if (hooks.onSummarizeStart) hooks.onSummarizeStart();
            return fetchTcRagSummarizeQuery(reqSummary, mode).then(function(query) {
                var q = String(query || '').trim();
                if (!q) {
                    emitTcRagContextDone(hooks, {
                        hit: false,
                        ragEnabled: true,
                        validateEnabled: validateEnabled
                    });
                    return finishBundle(reqSummary, '');
                }
                return runRetrieval(q).then(function(ragCtx) {
                    emitTcRagContextDone(hooks, {
                        hit: !!String(ragCtx || '').trim(),
                        ragEnabled: true,
                        validateEnabled: validateEnabled
                    });
                    return finishBundle(reqSummary, ragCtx);
                });
            });
        }
        emitTcRagContextDone(hooks, {
            hit: false,
            ragEnabled: true,
            validateEnabled: validateEnabled,
            skipReason: hasLanhu ? '' : '缺少蓝湖摘要，未检索'
        });
        return Promise.resolve(finishBundle(reqSummary, ''));
    }

    if (hasLanhu) {
        return fetchTcLanhuRequirementsWithHooks(creds, hooks).then(runRagPipeline);
    }
    emitTcLanhuDone(hooks, false);
    return runRagPipeline('');
}

/** Context Stack：蓝湖 + 平台公共 RAG，带 budget */
function resolveTcGenerateKnowledgeContextStack(mode, hooks) {
    hooks = hooks || {};
    var validateEnabled = !!hooks.validateEnabled;
    var stage = hooks.contextStage || 'module';
    var creds = getTcLanhuCredentialsForMode(mode);
    var hasLanhu = !!(creds.cookie && creds.url);
    var hasPublic = isTcRagEnabled() && isTcPublicRagAdmin();
    var userPrompt = String(hooks.userPrompt || '').trim();

    function finishBundle(reqSummary, publicCtx, query, publicChunks) {
        var bundle = {
            requirements: String(reqSummary || '').trim(),
            personalContext: '',
            publicContext: String(publicCtx || '').trim(),
            personalChunks: [],
            publicChunks: publicChunks || [],
            query: String(query || '').trim()
        };
        bundle.ragContext = bundle.publicContext;
        return tcApplyBudgetToBundle(bundle, stage);
    }

    function runRetrieval(query, reqSummary) {
        if (!hasPublic) {
            return Promise.resolve(finishBundle(reqSummary, '', query, []));
        }
        if (hooks.onLegacyStart) hooks.onLegacyStart();
        return fetchTcRagRetrieveContext(query, { includePublic: true, returnMeta: true })
            .then(function(publicMeta) {
                publicMeta = publicMeta || {};
                TC_LAST_PUBLIC_RAG_CHUNKS = publicMeta.chunks || [];
                return finishBundle(reqSummary, publicMeta.context || '', query, TC_LAST_PUBLIC_RAG_CHUNKS);
            });
    }

    function afterRequirements(reqSummary) {
        reqSummary = String(reqSummary || '').trim();
        emitTcRagContextCheck(hooks, hasPublic, validateEnabled);
        if (!hasPublic && !reqSummary) {
            emitTcRagContextDone(hooks, {
                hit: false,
                ragEnabled: false,
                validateEnabled: validateEnabled,
                skipReason: '未开启 RAG'
            });
            return Promise.resolve(finishBundle('', '', '', []));
        }
        if (!hasPublic) {
            emitTcRagContextDone(hooks, {
                hit: false,
                ragEnabled: false,
                validateEnabled: validateEnabled,
                skipReason: '未开启 RAG'
            });
            return Promise.resolve(finishBundle(reqSummary, '', '', []));
        }
        if (hooks.onSummarizeStart) hooks.onSummarizeStart();
        return resolveTcQueryForRetrieval(reqSummary, mode, userPrompt).then(function(query) {
            var q = String(query || '').trim();
            if (!q) {
                emitTcRagContextDone(hooks, {
                    hit: false,
                    ragEnabled: true,
                    validateEnabled: validateEnabled
                });
                return finishBundle(reqSummary, '', '', []);
            }
            return runRetrieval(q, reqSummary).then(function(bundle) {
                emitTcRagContextDone(hooks, {
                    hit: !!String((bundle && bundle.publicContext) || '').trim(),
                    ragEnabled: true,
                    validateEnabled: validateEnabled
                });
                return bundle;
            });
        });
    }

    if (hasLanhu) {
        return fetchTcLanhuRequirementsWithHooks(creds, hooks).then(afterRequirements);
    }
    emitTcLanhuDone(hooks, false);
    return afterRequirements('');
}

window.tcPublicRagAdminUnlocked = tcPublicRagAdminUnlocked;
window.isTcContextStackEnabled = isTcContextStackEnabled;
window.isTcPublicRagAdmin = isTcPublicRagAdmin;
window.applyTcContextStackStatus = applyTcContextStackStatus;
window.syncTcRagVisibilityForRole = syncTcRagVisibilityForRole;
window.resolveTcGenerateKnowledgeContextLegacy = resolveTcGenerateKnowledgeContextLegacy;
window.resolveTcGenerateKnowledgeContextStack = resolveTcGenerateKnowledgeContextStack;
