/**
 * 测试用例 AI 配置桥接：同步「用例生成」与「Excel 润色」弹窗的内网预设 / 自定义配置。
 */
(function (global) {
    'use strict';

    var PRESET = {
        baseUrl: '',
        apiKey: '',
        model: '',
        temperature: '0.1'
    };

    var syncingCustom = false;
    var modeObserver = null;

    var CUSTOM_FIELD_MAP = [
        ['ai-base-url', 'ctm-ai-polish-base-url'],
        ['ai-api-key', 'ctm-ai-polish-api-key'],
        ['ai-model', 'ctm-ai-polish-model'],
        ['ai-temperature', 'ctm-ai-polish-temperature']
    ];

    function $(id) {
        return document.getElementById(id);
    }

    function normalizeMode(mode) {
        return mode === 'custom' ? 'custom' : 'preset';
    }

    function getTcModeRoot() {
        return $('ai-config-mode-root');
    }

    function getCtmModeRoot() {
        return $('ctm-ai-polish-mode-root');
    }

    function readModeFromRoot(root) {
        if (!root) return null;
        return root.getAttribute('data-mode') === 'custom' ? 'custom' : 'preset';
    }

    function getMode() {
        var tcRoot = getTcModeRoot();
        if (tcRoot) return readModeFromRoot(tcRoot);
        var ctmRoot = getCtmModeRoot();
        if (ctmRoot) return readModeFromRoot(ctmRoot);
        return 'preset';
    }

    function applyPresetObject(cfg) {
        if (!cfg) return;
        if (cfg.base_url) PRESET.baseUrl = cfg.base_url;
        if (cfg.baseUrl) PRESET.baseUrl = cfg.baseUrl;
        if (cfg.api_key != null) PRESET.apiKey = cfg.api_key;
        if (cfg.apiKey != null) PRESET.apiKey = cfg.apiKey;
        if (cfg.model) PRESET.model = cfg.model;
        if (cfg.temperature != null) PRESET.temperature = String(cfg.temperature);
    }

    function syncPresetSummaries() {
        ['tc-preset-model-summary', 'ctm-preset-model-summary'].forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.textContent = '';
            el.classList.add('hidden');
        });
    }

    function applyModeChrome(mode, source) {
        var m = normalizeMode(mode);
        var tcRoot = getTcModeRoot();
        var ctmRoot = getCtmModeRoot();

        if (source !== 'tc' && tcRoot) {
            tcRoot.setAttribute('data-mode', 'preset');
            var tcPresetPanel = $('ai-config-preset-panel');
            if (tcPresetPanel) tcPresetPanel.classList.remove('hidden');
        }

        if (source !== 'ctm' && ctmRoot) {
            ctmRoot.setAttribute('data-mode', m);
            var ctmModal = $('ctm-ai-polish-modal');
            if (ctmModal) ctmModal.setAttribute('data-mode', m);
            var ctmPresetPanel = $('ctm-ai-polish-preset-panel');
            var ctmCustomPanel = $('ctm-ai-polish-custom-panel');
            var ctmBtnP = $('ctm-ai-config-mode-preset-btn');
            var ctmBtnC = $('ctm-ai-config-mode-custom-btn');
            if (ctmPresetPanel && ctmCustomPanel) {
                ctmPresetPanel.classList.toggle('hidden', m !== 'preset');
                ctmCustomPanel.classList.toggle('hidden', m !== 'custom');
            }
            if (ctmBtnP && ctmBtnC) {
                ctmBtnP.classList.toggle('tc-ai-config-seg__btn--active', m === 'preset');
                ctmBtnC.classList.toggle('tc-ai-config-seg__btn--active', m === 'custom');
                ctmBtnP.setAttribute('aria-selected', m === 'preset' ? 'true' : 'false');
                ctmBtnC.setAttribute('aria-selected', m === 'custom' ? 'true' : 'false');
            }
            if (m === 'preset') syncPresetSummaries();
        }
    }

    function copyCustomField(fromId, toId) {
        var fromEl = $(fromId);
        var toEl = $(toId);
        if (!fromEl || !toEl || fromEl.value === toEl.value) return;
        toEl.value = fromEl.value;
    }

    function syncCustomFieldsFrom(sourceId) {
        if (syncingCustom) return;
        syncingCustom = true;
        try {
            CUSTOM_FIELD_MAP.forEach(function (pair) {
                if (sourceId === pair[0]) copyCustomField(pair[0], pair[1]);
                else if (sourceId === pair[1]) copyCustomField(pair[1], pair[0]);
            });
            if (!sourceId) {
                var tcBase = $('ai-base-url');
                var ctmBase = $('ctm-ai-polish-base-url');
                if (tcBase && ctmBase) {
                    if (String(tcBase.value || '').trim()) copyCustomField('ai-base-url', 'ctm-ai-polish-base-url');
                    else copyCustomField('ctm-ai-polish-base-url', 'ai-base-url');
                } else {
                    CUSTOM_FIELD_MAP.forEach(function (pair) {
                        if ($(pair[0]) && $(pair[1])) copyCustomField(pair[0], pair[1]);
                    });
                }
            }
        } finally {
            syncingCustom = false;
        }
    }

    function readCustomFieldValue(ids) {
        for (var i = 0; i < ids.length; i++) {
            var el = $(ids[i]);
            if (el) return String(el.value || '').trim();
        }
        return '';
    }

    function validateCustomCredentials() {
        var baseUrl = readCustomFieldValue(['ai-base-url', 'ctm-ai-polish-base-url']);
        var apiKey = readCustomFieldValue(['ai-api-key', 'ctm-ai-polish-api-key']);
        var model = readCustomFieldValue(['ai-model', 'ctm-ai-polish-model']);
        var tempRaw = readCustomFieldValue(['ai-temperature', 'ctm-ai-polish-temperature']);

        if (!baseUrl) return { ok: false, message: '请填写 Base URL' };
        if (!/^https?:\/\/.+/i.test(baseUrl)) {
            return { ok: false, message: 'Base URL 须以 http:// 或 https:// 开头' };
        }
        if (!apiKey) return { ok: false, message: '请填写 API Key' };
        if (!model) return { ok: false, message: '请填写 Model' };
        if (tempRaw) {
            var temp = Number(tempRaw);
            if (isNaN(temp)) return { ok: false, message: 'Temperature 须为数字' };
            if (temp < 0 || temp > 2) return { ok: false, message: 'Temperature 须在 0～2 之间' };
        }
        return {
            ok: true,
            base_url: baseUrl,
            api_key: apiKey,
            model: model,
            temperature: tempRaw ? Number(tempRaw) : null
        };
    }

    function validatePresetCredentials() {
        var baseUrl = String(PRESET.baseUrl || '').trim();
        var apiKey = String(PRESET.apiKey || '').trim();
        var model = String(PRESET.model || '').trim();
        if (!baseUrl) return { ok: false, message: '请先在 AI 配置中填写 Base URL' };
        if (!apiKey) return { ok: false, message: '请先在 AI 配置中填写 API Key' };
        if (!model) return { ok: false, message: '请先在 AI 配置中填写 Model' };
        var tempNum = parseFloat(PRESET.temperature);
        if (Number.isNaN(tempNum)) tempNum = 0.1;
        return {
            ok: true,
            base_url: baseUrl,
            api_key: apiKey,
            model: model,
            temperature: tempNum
        };
    }

    function getCredentials() {
        if (getMode() === 'custom') return validateCustomCredentials();
        return validatePresetCredentials();
    }

    function loadPresetFromServer() {
        function applyUserOrBuiltin(userData, me) {
            if (userData && userData.configured) {
                applyPresetObject(userData);
                syncPresetSummaries();
                return userData;
            }
            if (me && me.can_manage_builtin_ai) {
                return fetch('/api/builtin-ai/config', { credentials: 'same-origin' })
                    .then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                    })
                    .then(function (data) {
                        applyPresetObject(data);
                        syncPresetSummaries();
                        return data;
                    });
            }
            applyPresetObject(userData || {});
            syncPresetSummaries();
            return userData;
        }
        var mePromise = (global.HfAuthNav && global.HfAuthNav.fetchMe)
            ? global.HfAuthNav.fetchMe()
            : fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
        return mePromise.then(function (me) {
            if (!me || !me.authenticated) {
                applyPresetObject({});
                syncPresetSummaries();
                return null;
            }
            return fetch('/api/user-ai-config', { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (userData) { return applyUserOrBuiltin(userData, me); });
        });
    }

    function savePresetToServer(baseUrl, apiKey, model) {
        var temp = parseFloat(PRESET.temperature);
        if (Number.isNaN(temp)) temp = 0.1;
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
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
                applyPresetObject({ base_url: baseUrl, api_key: apiKey, model: model, temperature: temp });
                if (global.HfUserAiConfig && global.HfUserAiConfig.loadConfig) {
                    global.HfUserAiConfig.loadConfig(true);
                }
                return data;
            });
        });
    }

    function openPresetModelModal() {
        var modal = $('tc-preset-model-modal');
        var urlInp = $('tc-preset-modal-base-url');
        var keyInp = $('tc-preset-modal-api-key');
        var modelInp = $('tc-preset-modal-model');
        if (!modal || !urlInp || !keyInp || !modelInp) return;
        if (modal.parentNode !== document.body) document.body.appendChild(modal);

        loadPresetFromServer()
            .catch(function () { /* 沿用已加载 PRESET */ })
            .finally(function () {
                urlInp.value = PRESET.baseUrl || '';
                keyInp.value = PRESET.apiKey || '';
                modelInp.value = PRESET.model || '';
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                document.body.style.overflow = 'hidden';
                urlInp.focus();
            });
    }

    function closePresetModelModal() {
        var modal = $('tc-preset-model-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        document.body.style.overflow = '';
    }

    function notifyPresetUpdated(cfg) {
        applyPresetObject(cfg);
        syncPresetSummaries();
        document.dispatchEvent(new CustomEvent('th-ai-preset-updated', { detail: cfg || PRESET }));
    }

    function isPresetUnlocked() {
        if (global.__thTcAi && typeof global.__thTcAi.isPresetUnlocked === 'function') {
            return global.__thTcAi.isPresetUnlocked();
        }
        return !getTcModeRoot();
    }

    function requestPresetUnlock(callback) {
        if (isPresetUnlocked()) {
            if (callback) callback();
            return;
        }
        if (global.__thTcAi && typeof global.__thTcAi.requestPresetUnlock === 'function') {
            global.__thTcAi.requestPresetUnlock(callback);
            return;
        }
        document.dispatchEvent(new CustomEvent('th-request-preset-unlock', {
            detail: { callback: callback || null }
        }));
    }

    function setMode(mode, skipUnlockCheck, source) {
        var m = normalizeMode(mode);
        if (m === 'preset' && !skipUnlockCheck && !isPresetUnlocked()) {
            requestPresetUnlock(function () {
                setMode('preset', true, source);
            });
            return;
        }

        if (getTcModeRoot() && global.__thTcAi && typeof global.__thTcAi.switchMode === 'function') {
            global.__thTcAi.switchMode(m, skipUnlockCheck === true);
            return;
        }

        applyModeChrome(m);
    }

    function syncPresetLockChrome() {
        var unlocked = isPresetUnlocked();
        [
            ['ai-config-mode-preset-lock', 'ai-config-mode-preset-btn'],
            ['ctm-ai-config-mode-preset-lock', 'ctm-ai-config-mode-preset-btn']
        ].forEach(function (pair) {
            var lockEl = $(pair[0]);
            var btnEl = $(pair[1]);
            if (lockEl) lockEl.classList.toggle('hidden', unlocked);
            if (btnEl) btnEl.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
        });
    }

    function bindCustomFieldSync() {
        CUSTOM_FIELD_MAP.forEach(function (pair) {
            pair.forEach(function (id) {
                var el = $(id);
                if (!el || el._thAiBridgeBound) return;
                el._thAiBridgeBound = true;
                el.addEventListener('input', function () {
                    syncCustomFieldsFrom(id);
                });
                el.addEventListener('change', function () {
                    syncCustomFieldsFrom(id);
                });
            });
        });
    }

    function bindModeControls() {
        var ctmPresetBtn = $('ctm-ai-config-mode-preset-btn');
        var ctmCustomBtn = $('ctm-ai-config-mode-custom-btn');
        if (ctmPresetBtn && !ctmPresetBtn._thAiBridgeBound) {
            ctmPresetBtn._thAiBridgeBound = true;
            ctmPresetBtn.addEventListener('click', function () {
                setMode('preset', false);
            });
        }
        if (ctmCustomBtn && !ctmCustomBtn._thAiBridgeBound) {
            ctmCustomBtn._thAiBridgeBound = true;
            ctmCustomBtn.addEventListener('click', function () {
                setMode('custom', true);
            });
        }

        var tcRoot = getTcModeRoot();
        if (tcRoot && !modeObserver) {
            modeObserver = new MutationObserver(function () {
                var mode = readModeFromRoot(tcRoot);
                if (mode) applyModeChrome(mode, 'tc');
            });
            modeObserver.observe(tcRoot, { attributes: true, attributeFilter: ['data-mode'] });
        }
    }

    function bindPresetSettingsUi() {
        var openBtns = ['ctm-preset-model-settings-btn'];
        openBtns.forEach(function (id) {
            var btn = $(id);
            if (!btn || btn._thAiBridgeBound) return;
            btn._thAiBridgeBound = true;
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                requestPresetUnlock(openPresetModelModal);
            });
        });

        var cancelBtn = $('tc-preset-model-cancel-btn');
        var saveBtn = $('tc-preset-model-save-btn');
        var modal = $('tc-preset-model-modal');
        if (cancelBtn && !cancelBtn._thAiBridgeBound) {
            cancelBtn._thAiBridgeBound = true;
            cancelBtn.addEventListener('click', closePresetModelModal);
        }
        if (modal && !modal._thAiBridgeBound) {
            modal._thAiBridgeBound = true;
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closePresetModelModal();
            });
        }
        if (saveBtn && !saveBtn._thAiBridgeBound) {
            saveBtn._thAiBridgeBound = true;
            saveBtn.addEventListener('click', function () {
                var urlInp = $('tc-preset-modal-base-url');
                var keyInp = $('tc-preset-modal-api-key');
                var modelInp = $('tc-preset-modal-model');
                var baseUrl = (urlInp && urlInp.value || '').trim();
                var apiKey = (keyInp && keyInp.value || '').trim();
                var model = (modelInp && modelInp.value || '').trim();
                if (!baseUrl || !apiKey || !model) {
                    document.dispatchEvent(new CustomEvent('th-ai-config-alert', {
                        detail: { message: '请填写 API 地址、API Key 与模型名称。', title: '参数不完整' }
                    }));
                    return;
                }
                saveBtn.disabled = true;
                savePresetToServer(baseUrl, apiKey, model)
                    .then(function (data) {
                        notifyPresetUpdated(data);
                        closePresetModelModal();
                        document.dispatchEvent(new CustomEvent('th-ai-config-toast', {
                            detail: { message: '内网模型连接已保存到服务器。' }
                        }));
                    })
                    .catch(function (err) {
                        document.dispatchEvent(new CustomEvent('th-ai-config-alert', {
                            detail: { message: (err && err.message) || '保存失败', title: '保存失败' }
                        }));
                    })
                    .finally(function () { saveBtn.disabled = false; });
            });
        }
    }

    function init() {
        if (!$('ctm-ai-polish-mode-root') && !getTcModeRoot()) return;

        bindCustomFieldSync();
        bindModeControls();
        bindPresetSettingsUi();
        loadPresetFromServer().catch(function () { /* ignore */ });
        syncCustomFieldsFrom(null);

        var initialMode = getMode();
        applyModeChrome(initialMode);
        syncPresetLockChrome();

        document.addEventListener('th-ai-preset-updated', function (ev) {
            applyPresetObject(ev.detail);
            syncPresetSummaries();
        });
    }

    global.ThAiConfigBridge = {
        getMode: getMode,
        setMode: setMode,
        getCredentials: getCredentials,
        syncCustomFieldsFrom: syncCustomFieldsFrom,
        syncPresetSummaries: syncPresetSummaries,
        syncPresetLockChrome: syncPresetLockChrome,
        onPresetUpdated: notifyPresetUpdated,
        loadPresetFromServer: loadPresetFromServer
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(window));
