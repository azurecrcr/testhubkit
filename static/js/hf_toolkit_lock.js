/**
 * 统一功能锁（MySQL toolkit_lock_switch.is_locked）
 */
(function (global) {
    if (typeof global.HF_TOOLKIT_RESTRICTED === 'undefined') {
        global.HF_TOOLKIT_RESTRICTED = true;
    }

    function hfToolkitRestricted() {
        return !!global.HF_TOOLKIT_RESTRICTED;
    }

    function hfToolkitFeatureUsable() {
        return !hfToolkitRestricted();
    }

    function hfToolkitLockBlockedToast() {
        var msg = '敏感功能已统一上锁。如需开放，请由管理员在「全站 AI 配置」中关闭「敏感功能统一上锁」。';
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(msg, { placement: 'top', variant: 'warning', duration: 3200 });
            return;
        }
        if (typeof global.tcAppAlert === 'function') {
            global.tcAppAlert(msg, { variant: 'warning', title: '功能已上锁' });
            return;
        }
        alert(msg);
    }

    function hfApplyGlobalSwitchState(status) {
        if (typeof global.dispatchEvent === 'function') {
            try {
                global.dispatchEvent(new CustomEvent('hf-global-switch-updated', { detail: status || {} }));
            } catch (e) {}
        }
        if (!status || typeof status !== 'object') return;
        if (typeof status.is_locked !== 'undefined') {
            global.HF_TOOLKIT_RESTRICTED = !!status.is_locked;
            if (typeof global.syncTcFeatureLockChrome === 'function') {
                global.syncTcFeatureLockChrome();
            }
            if (typeof global.syncTcStashLockChrome === 'function') {
                global.syncTcStashLockChrome();
            }
        }
        if (typeof status.prompt_cards_blur !== 'undefined') {
            global.HF_PROMPT_CARDS_BLURRED = !!status.prompt_cards_blur;
        }
        try {
            global.dispatchEvent(new CustomEvent('hf-global-switches-updated', { detail: status }));
        } catch (e) { /* ignore */ }
    }

    function hfReloadToolkitLock() {
        return fetch('/api/toolkit-lock', { credentials: 'same-origin' })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { ok: res.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result.ok || !result.data) {
                    throw new Error('加载统一开关失败');
                }
                hfApplyGlobalSwitchState(result.data);
                return global.HF_TOOLKIT_RESTRICTED;
            });
    }

    global.hfToolkitRestricted = hfToolkitRestricted;
    global.hfToolkitFeatureUsable = hfToolkitFeatureUsable;
    global.hfToolkitLockBlockedToast = hfToolkitLockBlockedToast;
    global.hfReloadToolkitLock = hfReloadToolkitLock;
    global.hfApplyGlobalSwitchState = hfApplyGlobalSwitchState;

    document.addEventListener('DOMContentLoaded', function () {
        hfReloadToolkitLock().catch(function () { /* keep SSR defaults */ });
    });
})(typeof window !== 'undefined' ? window : globalThis);
