/**

 * 用例录入 · AI 生成页：登录后将「清空」变为「保存」，内网预设配置持久化到服务器。

 * 生成用例时若填写了蓝湖 Cookie/URL，自动合并保存到账号。

 */

(function (global) {

    'use strict';



    var authed = false;

    var prefsLoaded = false;

    var prefsLoading = false;



    function $(id) { return document.getElementById(id); }



    function toast(msg, opts) {

        if (typeof global.tcAppToast === 'function') {

            global.tcAppToast(msg, opts || { variant: 'success', duration: 2600 });

        }

    }



    function syncButtons() {

        var btnPreset = $('clear-ai-form-preset');

        if (!btnPreset) return;

        if (authed) {

            btnPreset.textContent = '保存';

            btnPreset.title = '保存内网预设：蓝湖配置与提示词到账号';

        } else {

            btnPreset.textContent = '清空';

            btnPreset.title = '清空内网预设：蓝湖配置与提示词';

        }

    }



    function savePromptDraft() {

        if (typeof global.saveTcAiPromptDraftForMode === 'function') {

            global.saveTcAiPromptDraftForMode('preset');

        }

    }



    function getPromptDraft() {

        if (global.tcAiPromptDrafts && global.tcAiPromptDrafts.preset != null) {

            return String(global.tcAiPromptDrafts.preset);

        }

        var el = $('ai-prompt');

        return el ? el.value : '';

    }



    function collectPresetConfig() {

        savePromptDraft();

        return {

            lanhu_cookie: ($('lanhu-cookie') || {}).value || '',

            lanhu_url: ($('lanhu-url') || {}).value || '',

            prompt: getPromptDraft()

        };

    }



    function applyPresetConfig(cfg) {

        if (!cfg || typeof cfg !== 'object') return;

        var onWorkbench = !!(document.getElementById('tc-wb-history-list') ||
            document.querySelector('.tc-workbench-scope'));

        var cookieEl = $('lanhu-cookie');

        var urlEl = $('lanhu-url');

        if (!onWorkbench) {

            if (cookieEl && cfg.lanhu_cookie != null) cookieEl.value = String(cfg.lanhu_cookie);

            if (urlEl && cfg.lanhu_url != null) urlEl.value = String(cfg.lanhu_url);

        }

        global.tcAiPromptDrafts = global.tcAiPromptDrafts || { preset: '' };

        global.tcAiPromptDrafts.preset = cfg.prompt != null ? String(cfg.prompt) : '';

        if (typeof global.loadTcAiPromptDraftForMode === 'function') {

            global.loadTcAiPromptDraftForMode('preset');

        }

        if (typeof global.autoGrowTcPresetLanhuField === 'function') {

            global.autoGrowTcPresetLanhuField(cookieEl);

            global.autoGrowTcPresetLanhuField(urlEl);

        }

    }



    function putPrefs(payload) {

        return fetch('/api/test-case-ai-form-prefs', {

            method: 'PUT',

            credentials: 'same-origin',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(payload)

        }).then(function (r) {

            return r.json().then(function (d) { return { ok: r.ok, data: d }; });

        });

    }



    function savePrefs() {

        return putPrefs({

            mode: 'preset',

            config: collectPresetConfig()

        }).then(function (res) {

            if (!res.ok) throw new Error((res.data && res.data.error) || '保存失败');

            toast('内网预设配置已保存到账号。', { variant: 'success', duration: 2600 });

            return res.data;

        });

    }



    function persistLanhuAfterGenerate(cookie, url) {

        if (!authed) return Promise.resolve();

        cookie = String(cookie || '').trim();

        url = String(url || '').trim();

        if (!cookie || !url) return Promise.resolve();

        return putPrefs({

            mode: 'preset',

            merge: true,

            config: {

                lanhu_cookie: cookie,

                lanhu_url: url

            }

        }).then(function (res) {

            if (!res.ok) return;

            prefsLoaded = true;

        }).catch(function () { /* 静默失败，不影响生成 */ });

    }



    function loadAllPrefs(force) {

        if (!authed) return Promise.resolve();

        if (prefsLoaded && !force) return Promise.resolve();

        if (prefsLoading) return Promise.resolve();

        prefsLoading = true;

        return fetch('/api/test-case-ai-form-prefs', { credentials: 'same-origin' })

            .then(function (r) { return r.json(); })

            .then(function (data) {

                if (data && data.error) return;

                if (data && data.preset) applyPresetConfig(data.preset);

                prefsLoaded = true;

            })

            .catch(function () { /* ignore */ })

            .finally(function () { prefsLoading = false; });

    }



    function onAuthUpdated(data) {

        var wasAuthed = authed;

        authed = !!(data && data.authenticated);

        syncButtons();

        if (authed && !wasAuthed) {

            prefsLoaded = false;

            loadAllPrefs(true);

        }

        if (!authed) prefsLoaded = false;

    }



    function handlePresetBtnClick(e) {

        if (authed) {

            e.preventDefault();

            e.stopImmediatePropagation();

            savePrefs().catch(function (err) {

                toast(err.message || '保存失败', { variant: 'error', duration: 3200 });

            });

            return;

        }

        e.preventDefault();

        e.stopImmediatePropagation();

        if (typeof global.clearTcAiPresetForm === 'function') global.clearTcAiPresetForm();

    }



    function bindButtons() {

        var btnPreset = $('clear-ai-form-preset');

        if (btnPreset && !btnPreset._tcPrefsBound) {

            btnPreset._tcPrefsBound = true;

            btnPreset.addEventListener('click', handlePresetBtnClick, true);

        }

    }



    function initAfterDomReady() {

        bindButtons();

        syncButtons();

        setTimeout(function () {

            if (authed) loadAllPrefs(true);

        }, 0);

    }



    function init() {

        global.TcAiFormPrefs = {

            persistLanhuAfterGenerate: persistLanhuAfterGenerate,

            loadAllPrefs: loadAllPrefs,

            isAuthed: function () { return authed; }

        };

        document.addEventListener('hf-auth-nav-updated', function (ev) {

            onAuthUpdated(ev.detail || {});

        });

        if (global.HfAuthNav && global.HfAuthNav.fetchMe) {

            global.HfAuthNav.fetchMe().then(onAuthUpdated).catch(function () { onAuthUpdated(null); });

        }

        if (document.readyState === 'loading') {

            document.addEventListener('DOMContentLoaded', initAfterDomReady);

        } else {

            initAfterDomReady();

        }

    }



    init();

})(typeof window !== 'undefined' ? window : this);


