/**
 * 压测造数 · JMeter 场景未保存离开提醒（隔离模块）
 * - 组件增删改 / AI 改动 → markScenarioDirty
 * - 切「数据构建」、刷新/关闭、点全局导航离开时拦截
 * - F5 / Ctrl+R：拦截并用站内样式弹窗（浏览器工具栏刷新仍可能走系统框）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-jms-leave-guard';
    var RELOAD_TOKEN = '__jms_reload__';
    var pendingNavigateUrl = null;
    var allowUnloadOnce = false;
    var leaveMode = 'navigate'; // navigate | reload

    function isJmeterTab() {
        return !!(document.body && document.body.classList.contains('lth-hub-jmeter-tab'));
    }

    function isDirty() {
        var S = global.JmsScenarioStudio;
        return !!(S && typeof S.isDirty === 'function' && S.isDirty());
    }

    function clearDirty() {
        var S = global.JmsScenarioStudio;
        if (S && typeof S.clearDirtyState === 'function') S.clearDirtyState();
    }

    function toast(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error', placement: 'bottom' });
            return;
        }
        if (!ok) console.warn(text);
    }

    function syncYamlFromVisual() {
        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.beforeValidate === 'function') {
            try { global.JmsVisualBuilder.beforeValidate(); } catch (e1) { /* ignore */ }
        }
    }

    function collectYamlPayload() {
        var yamlInput = document.getElementById('yaml-input');
        syncYamlFromVisual();
        return { yaml: yamlInput ? String(yamlInput.value || '') : '' };
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n); }

    function defaultTitle() {
        var d = new Date();
        return '未保存场景-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
            pad2(d.getHours()) + pad2(d.getMinutes());
    }

    function ensureModal() {
        var el = document.getElementById(MODAL_ID);
        if (el) return el;
        el = document.createElement('div');
        el.id = MODAL_ID;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('aria-labelledby', 'jms-leave-guard-title');
        el.innerHTML =
            '<div class="jms-leave-guard-card" role="document">' +
            '  <div class="jms-leave-guard-icon" aria-hidden="true">' +
            '    <svg viewBox="0 0 24 24" width="22" height="22" fill="none">' +
            '      <path d="M12 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '      <circle cx="12" cy="16.25" r="1.15" fill="currentColor"/>' +
            '      <path d="M12 3.5A8.5 8.5 0 1 1 3.5 12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
            '      <path d="M3.5 6.2V12h5.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '    </svg>' +
            '  </div>' +
            '  <p class="jms-leave-guard-kicker" id="jms-leave-guard-kicker">未保存改动</p>' +
            '  <h3 id="jms-leave-guard-title" class="jms-leave-guard-title">离开前先保存一下？</h3>' +
            '  <p class="jms-leave-guard-msg" id="jms-leave-guard-msg"></p>' +
            '  <div class="jms-leave-guard-field" id="jms-leave-guard-field">' +
            '    <label class="jms-leave-guard-label" for="jms-leave-guard-title-input">场景名称</label>' +
            '    <input type="text" id="jms-leave-guard-title-input" class="jms-leave-guard-input" maxlength="120" autocomplete="off" placeholder="给这次场景起个好记的名字">' +
            '  </div>' +
            '  <div class="jms-leave-guard-foot">' +
            '    <button type="button" id="jms-leave-guard-cancel" class="jms-leave-guard-btn jms-leave-guard-btn--ghost">继续编辑</button>' +
            '    <button type="button" id="jms-leave-guard-discard" class="jms-leave-guard-btn jms-leave-guard-btn--soft">不保存并离开</button>' +
            '    <button type="button" id="jms-leave-guard-save" class="jms-leave-guard-btn jms-leave-guard-btn--primary">保存并离开</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(el);
        el.addEventListener('click', function (ev) {
            if (ev.target === el) closeModal(false);
        });
        var cancel = document.getElementById('jms-leave-guard-cancel');
        var discard = document.getElementById('jms-leave-guard-discard');
        var save = document.getElementById('jms-leave-guard-save');
        if (cancel) cancel.addEventListener('click', function () { closeModal(false); });
        if (discard) discard.addEventListener('click', onDiscardLeave);
        if (save) save.addEventListener('click', onSaveLeave);
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && el.classList.contains('jms-modal-open')) {
                closeModal(false);
            }
        });
        return el;
    }

    function applyModeCopy(mode) {
        leaveMode = mode === 'reload' ? 'reload' : 'navigate';
        var title = document.getElementById('jms-leave-guard-title');
        var msg = document.getElementById('jms-leave-guard-msg');
        var kicker = document.getElementById('jms-leave-guard-kicker');
        var discard = document.getElementById('jms-leave-guard-discard');
        var save = document.getElementById('jms-leave-guard-save');
        var cancel = document.getElementById('jms-leave-guard-cancel');
        if (kicker) kicker.textContent = '未保存改动';
        if (leaveMode === 'reload') {
            if (title) title.textContent = '刷新前先保存一下？';
            if (msg) {
                msg.textContent =
                    '当前场景有未保存的组件改动。刷新后本地未落盘的配置会丢失，建议先存到本机浏览器再刷新。';
            }
            if (discard) discard.textContent = '不保存并刷新';
            if (save) save.textContent = '保存并刷新';
            if (cancel) cancel.textContent = '留在本页';
        } else {
            if (title) title.textContent = '离开前先保存一下？';
            if (msg) {
                msg.textContent =
                    '检测到未保存的组件改动。建议先存到本机浏览器，再切换页面，避免辛苦配置丢失。';
            }
            if (discard) discard.textContent = '不保存并离开';
            if (save) save.textContent = '保存并离开';
            if (cancel) cancel.textContent = '继续编辑';
        }
    }

    function openModal(url, mode) {
        pendingNavigateUrl = url || null;
        var el = ensureModal();
        applyModeCopy(mode || (url === RELOAD_TOKEN ? 'reload' : 'navigate'));
        var inp = document.getElementById('jms-leave-guard-title-input');
        if (inp) inp.value = defaultTitle();
        el.setAttribute('aria-hidden', 'false');
        el.classList.remove('is-closing');
        el.classList.add('jms-modal-open');
        setTimeout(function () { if (inp) { inp.focus(); inp.select(); } }, 40);
    }

    function closeModal(_proceeding) {
        var el = document.getElementById(MODAL_ID);
        if (el) {
            el.classList.add('is-closing');
            el.classList.remove('jms-modal-open');
            el.setAttribute('aria-hidden', 'true');
            setTimeout(function () {
                el.classList.remove('is-closing');
            }, 180);
        }
        if (!_proceeding) {
            pendingNavigateUrl = null;
            leaveMode = 'navigate';
        }
    }

    function navigateTo(url) {
        allowUnloadOnce = true;
        closeModal(true);
        hidePageNavLoadingIfAny();
        if (!url) {
            pendingNavigateUrl = null;
            return;
        }
        var target = String(url);
        pendingNavigateUrl = null;
        if (target === RELOAD_TOKEN) {
            global.location.reload();
            return;
        }
        global.location.href = target;
    }

    function onDiscardLeave() {
        clearDirty();
        navigateTo(pendingNavigateUrl);
    }

    function onSaveLeave() {
        var cloud = global.HfJmeterSceneCloudV1;
        var inp = document.getElementById('jms-leave-guard-title-input');
        var title = inp ? String(inp.value || '').trim() : '';
        if (!title) {
            toast('请填写场景名称。', false);
            if (inp) inp.focus();
            return;
        }
        var payload = collectYamlPayload();
        if (!String(payload.yaml || '').trim()) {
            toast('当前没有可保存的场景内容。', false);
            return;
        }
        function afterSaved() {
            clearDirty();
            toast(
                leaveMode === 'reload'
                    ? ('已保存「' + title + '」，正在刷新…')
                    : ('已保存「' + title + '」，正在离开…'),
                true
            );
            navigateTo(pendingNavigateUrl);
        }
        if (cloud && typeof cloud.saveNew === 'function') {
            cloud.saveNew(title, payload).then(afterSaved).catch(function (err) {
                toast((err && err.message) || '保存失败', false);
            });
            return;
        }
        var store = global.HfLocalStash && global.HfLocalStash.jmeter;
        if (!store || typeof store.saveNew !== 'function') {
            toast('保存模块未就绪，请改用页面「保存」按钮。', false);
            return;
        }
        try {
            store.saveNew(title, payload);
            afterSaved();
        } catch (err) {
            toast((err && err.message) || '保存失败', false);
        }
    }

    function samePageJmeter(url) {
        try {
            var u = new URL(url, global.location.href);
            if (u.pathname.indexOf('/tool/api-scenario-studio') < 0) return false;
            var tab = (u.searchParams.get('tab') || 'jmeter').toLowerCase();
            return tab === 'jmeter' || tab === '' || tab === 'jmx';
        } catch (e1) {
            return false;
        }
    }

    function isLeaveModalOpen() {
        var el = document.getElementById(MODAL_ID);
        return !!(el && el.classList.contains('jms-modal-open'));
    }

    function shouldGuardNavigation(anchor) {
        if (!isJmeterTab() || !isDirty()) return false;
        if (!anchor || !anchor.getAttribute) return false;
        var href = anchor.getAttribute('href');
        if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return false;
        if (anchor.target && String(anchor.target).toLowerCase() === '_blank') return false;
        if (anchor.hasAttribute('download')) return false;
        if (samePageJmeter(href)) return false;
        return true;
    }

    function hidePageNavLoadingIfAny() {
        try {
            if (typeof global.hfHidePageNavLoading === 'function') {
                global.hfHidePageNavLoading();
            }
        } catch (eHide) { /* ignore */ }
        var el = document.getElementById('hf-page-nav-loading');
        if (el) {
            el.classList.remove('is-visible');
            el.setAttribute('aria-hidden', 'true');
        }
        document.documentElement.classList.remove('hf-page-nav-loading-active');
    }

    function onDocumentClick(ev) {
        if (!isJmeterTab() || !isDirty()) return;
        var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
        if (!a || !shouldGuardNavigation(a)) return;
        ev.preventDefault();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        else ev.stopPropagation();
        hidePageNavLoadingIfAny();
        openModal(a.href, 'navigate');
    }

    function onReloadShortcut(ev) {
        if (!isJmeterTab() || !isDirty()) return;
        var key = String(ev.key || '').toLowerCase();
        var isF5 = key === 'f5' || ev.keyCode === 116;
        var isReloadCombo = (ev.ctrlKey || ev.metaKey) && key === 'r';
        if (!isF5 && !isReloadCombo) return;
        /* 已有保存弹窗：吞掉刷新，不再开第二层、不触发原生离开确认 */
        if (isLeaveModalOpen()) {
            ev.preventDefault();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            else ev.stopPropagation();
            return;
        }
        ev.preventDefault();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        else ev.stopPropagation();
        openModal(RELOAD_TOKEN, 'reload');
    }

    function onBeforeUnload(ev) {
        if (allowUnloadOnce) {
            allowUnloadOnce = false;
            return;
        }
        if (!isJmeterTab() || !isDirty()) return;
        /* 站内保存弹窗已打开时，不再叠浏览器原生确认框 */
        if (isLeaveModalOpen()) return;
        // 浏览器工具栏刷新/关页只能走系统框，文案与样式不可改
        ev.preventDefault();
        ev.returnValue = '';
        return '';
    }

    function boot() {
        if (global.__jmsScenarioLeaveGuardV1) return;
        global.__jmsScenarioLeaveGuardV1 = true;
        ensureModal();
        hidePageNavLoadingIfAny();
        document.addEventListener('click', onDocumentClick, true);
        document.addEventListener('keydown', onReloadShortcut, true);
        global.addEventListener('beforeunload', onBeforeUnload);
        global.addEventListener('pageshow', hidePageNavLoadingIfAny);
        global.addEventListener('focus', hidePageNavLoadingIfAny);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') hidePageNavLoadingIfAny();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hidePageNavLoadingIfAny);
    } else {
        hidePageNavLoadingIfAny();
    }

    if (document.readyState === 'complete') {
        boot();
    } else {
        global.addEventListener('load', boot);
    }

    global.JmsScenarioLeaveGuardV1 = {
        isDirty: isDirty,
        open: openModal,
        boot: boot,
        RELOAD_TOKEN: RELOAD_TOKEN
    };
})(typeof window !== 'undefined' ? window : this);
