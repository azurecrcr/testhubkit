/**
 * 蓝湖树操作登录守卫：未登录时拦截「+」与「连接蓝湖」入口。
 * 通过包装 window.openAddDocModal / openTcConnectModal 实现，不修改原函数内部逻辑。
 */
(function tcLanhuAuthGuard(global) {
    'use strict';

    var LOGIN_PROMPT_MSG = '请先登录后再使用此功能。';

    function fetchAuthMe() {
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            return global.HfAuthNav.fetchMe().catch(function () {
                return { authenticated: false };
            });
        }
        return fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .catch(function () { return { authenticated: false }; });
    }

    function showLoginRequiredPrompt() {
        if (typeof global.tcAppAlert === 'function') {
            return global.tcAppAlert(LOGIN_PROMPT_MSG, {
                title: '请先登录',
                variant: 'warning'
            });
        }
        global.alert(LOGIN_PROMPT_MSG);
        return Promise.resolve();
    }

    function ensureTcLanhuAuthOrPrompt() {
        return fetchAuthMe().then(function (me) {
            if (me && me.authenticated) return true;
            return showLoginRequiredPrompt().then(function () { return false; });
        });
    }

    function wrapLanhuAuthAction(fn) {
        if (typeof fn !== 'function') return fn;
        return function wrappedLanhuAuthAction() {
            var args = arguments;
            var self = this;
            ensureTcLanhuAuthOrPrompt().then(function (ok) {
                if (!ok) return;
                fn.apply(self, args);
            });
        };
    }

    function installLanhuAuthGuards() {
        if (global.openTcConnectModal && !global.openTcConnectModal.__tcLanhuAuthWrapped) {
            var origConnect = global.openTcConnectModal;
            var wrappedConnect = wrapLanhuAuthAction(origConnect);
            wrappedConnect.__tcLanhuAuthWrapped = true;
            global.openTcConnectModal = wrappedConnect;
        }
        if (global.openAddDocModal && !global.openAddDocModal.__tcLanhuAuthWrapped) {
            var origAdd = global.openAddDocModal;
            var wrappedAdd = wrapLanhuAuthAction(origAdd);
            wrappedAdd.__tcLanhuAuthWrapped = true;
            global.openAddDocModal = wrappedAdd;
        }
        if (global.openTcConnectModalForAdd && !global.openTcConnectModalForAdd.__tcLanhuAuthWrapped) {
            var origConnectAdd = global.openTcConnectModalForAdd;
            var wrappedConnectAdd = wrapLanhuAuthAction(origConnectAdd);
            wrappedConnectAdd.__tcLanhuAuthWrapped = true;
            global.openTcConnectModalForAdd = wrappedConnectAdd;
        }
    }

    global.ensureTcLanhuAuthOrPrompt = ensureTcLanhuAuthOrPrompt;
    global.installTcLanhuAuthGuards = installLanhuAuthGuards;

    installLanhuAuthGuards();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            installLanhuAuthGuards();
            global.setTimeout(installLanhuAuthGuards, 0);
        });
    } else {
        global.setTimeout(installLanhuAuthGuards, 0);
    }
})(typeof window !== 'undefined' ? window : this);