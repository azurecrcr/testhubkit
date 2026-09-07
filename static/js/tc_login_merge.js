/**
 * 未登录 → 登录：可选「合并本地历史」（暂存 / 知识库草稿）
 * 用户在本机对某账号确认过（合并或暂不）后，不再自动弹窗。
 */
(function (global) {
    'use strict';

    var RESOLVED_KEY_PREFIX = 'tc_login_merge_resolved_v1';
    var mergeLoggedIn = false;
    var currentUserKey = null;
    var pendingSnapshot = null;

    function fetchJson(url, opts) {
        opts = opts || {};
        opts.credentials = 'same-origin';
        if (opts.body && !opts.headers) {
            opts.headers = { 'Content-Type': 'application/json' };
        }
        return fetch(url, opts).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok || j.error) throw new Error(j.error || ('请求失败 (' + r.status + ')'));
                return j;
            });
        });
    }

    function toast(msg, opts) {
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast(msg, opts || { variant: 'info', duration: 3600 });
        }
    }

    function confirmDialog(message, hint) {
        if (typeof global.tcAppDialogOpen === 'function') {
            return global.tcAppDialogOpen({
                title: '合并本地历史',
                message: message,
                hint: hint || '合并后可跨设备查看；选择「暂不」不影响当前已登录功能，本机数据仍保留。',
                variant: 'info',
                showCancel: true,
                confirmText: '合并',
                cancelText: '暂不'
            });
        }
        return Promise.resolve(global.confirm(message));
    }

    function resolveUserKey(data) {
        var user = data && data.user;
        if (!user) return null;
        if (user.id != null && user.id !== '') return String(user.id);
        if (user.email) return String(user.email);
        return null;
    }

    function setCurrentUser(data) {
        currentUserKey = resolveUserKey(data);
    }

    function resolvedStorageKey() {
        return currentUserKey ? RESOLVED_KEY_PREFIX + ':' + currentUserKey : null;
    }

    function isAutoMergePromptResolved() {
        var key = resolvedStorageKey();
        if (!key) return false;
        try {
            return global.localStorage.getItem(key) === '1';
        } catch (e) {
            return false;
        }
    }

    function markAutoMergePromptResolved() {
        var key = resolvedStorageKey();
        if (!key) return;
        try {
            global.localStorage.setItem(key, '1');
        } catch (e) { /* ignore */ }
    }

    function captureLoginSnapshot() {
        return {};
    }

    function hasPendingLocalHistory() {
        return false;
    }

    function runMerge() {
        markAutoMergePromptResolved();
        return Promise.resolve();
    }

    function maybePromptMerge() {
        pendingSnapshot = null;
    }

    function promptMergeLocalHistory() {
        toast('本机暂无可合并的数据', { variant: 'info', duration: 2800 });
        return Promise.resolve(false);
    }

    function maybePromptMergeOnBoot() {
        if (!mergeLoggedIn || isAutoMergePromptResolved()) return;
        var snapshot = captureLoginSnapshot();
        if (!hasPendingLocalHistory(snapshot)) return;
        global.setTimeout(function () {
            if (!mergeLoggedIn || isAutoMergePromptResolved()) return;
            pendingSnapshot = snapshot;
            maybePromptMerge();
        }, 900);
    }

    function onAuthNavUpdated(ev, isCapture) {
        var detail = ev && ev.detail ? ev.detail : {};
        var nowLoggedIn = !!(detail.authenticated && detail.user);
        if (isCapture) {
            if (!mergeLoggedIn && nowLoggedIn) {
                setCurrentUser(detail);
                pendingSnapshot = captureLoginSnapshot();
            }
            return;
        }
        if (!mergeLoggedIn && nowLoggedIn) {
            setCurrentUser(detail);
            global.setTimeout(function () { maybePromptMerge(); }, 350);
        } else if (mergeLoggedIn && !nowLoggedIn) {
            currentUserKey = null;
            pendingSnapshot = null;
        } else if (nowLoggedIn) {
            setCurrentUser(detail);
        }
        mergeLoggedIn = nowLoggedIn;
    }

    function init() {
        if (global._tcLoginMergeInited) return;
        global._tcLoginMergeInited = true;
        global.addEventListener('hf-auth-nav-updated', function (ev) {
            onAuthNavUpdated(ev, true);
        }, true);
        global.addEventListener('hf-auth-nav-updated', function (ev) {
            onAuthNavUpdated(ev, false);
        });
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            global.HfAuthNav.fetchMe().then(function (data) {
                mergeLoggedIn = !!(data && data.authenticated && data.user);
                if (mergeLoggedIn) {
                    setCurrentUser(data);
                    maybePromptMergeOnBoot();
                }
            }).catch(function () {
                mergeLoggedIn = false;
                currentUserKey = null;
            });
        }
    }

    global.TcLoginMerge = {
        init: init,
        hasPendingLocalHistory: hasPendingLocalHistory,
        promptMergeLocalHistory: promptMergeLocalHistory,
        mergeLocalHistory: function () {
            if (!mergeLoggedIn) return Promise.resolve(false);
            var snapshot = captureLoginSnapshot();
            if (!hasPendingLocalHistory(snapshot)) return Promise.resolve(false);
            return runMerge(snapshot).then(function () { return true; });
        }
    };
    init();
})(typeof window !== 'undefined' ? window : this);
