/**
 * 配置元件 · 删除确认弹窗（隔离模块，替代原生 confirm）
 */
(function (global) {
    'use strict';

    var ROOT_ID = 'jms-cfg-del-confirm-root';
    var OPEN_CLASS = 'jms-cfg-del-confirm--open';
    var UI_VERSION = '20260703cfgdelpolish1';
    var pendingResolve = null;
    var bound = false;

    function getRoot() {
        return global.document.getElementById(ROOT_ID);
    }

    function ensureRoot() {
        var root = getRoot();
        if (root && root.getAttribute('data-ui-version') === UI_VERSION) return root;
        if (root && root.parentNode) root.parentNode.removeChild(root);

        root = global.document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'jms-cfg-del-confirm';
        root.setAttribute('data-ui-version', UI_VERSION);
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'jms-cfg-del-confirm-title');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML =
            '<div class="jms-cfg-del-confirm__backdrop" data-cfg-del-act="cancel"></div>' +
            '<div class="jms-cfg-del-confirm__panel">' +
            '<h2 id="jms-cfg-del-confirm-title" class="jms-cfg-del-confirm__title" data-cfg-del-field="title">删除配置元件</h2>' +
            '<p class="jms-cfg-del-confirm__message" data-cfg-del-field="message"></p>' +
            '<div class="jms-cfg-del-confirm__foot">' +
            '<button type="button" class="jms-cfg-del-confirm__btn jms-cfg-del-confirm__btn--ghost" data-cfg-del-act="cancel">取消</button>' +
            '<button type="button" class="jms-cfg-del-confirm__btn jms-cfg-del-confirm__btn--danger" data-cfg-del-act="confirm">删除</button>' +
            '</div></div>';

        global.document.body.appendChild(root);
        bindEvents();
        return root;
    }

    function finish(result) {
        var root = getRoot();
        if (root) {
            root.classList.remove(OPEN_CLASS);
            root.setAttribute('aria-hidden', 'true');
        }
        global.document.body.classList.remove('jms-cfg-del-confirm-lock');
        var resolve = pendingResolve;
        pendingResolve = null;
        if (resolve) resolve(!!result);
    }

    function onKeydown(ev) {
        if (!getRoot() || !getRoot().classList.contains(OPEN_CLASS)) return;
        if (ev.key === 'Escape') {
            ev.preventDefault();
            finish(false);
        }
    }

    function bindEvents() {
        if (bound) return;
        bound = true;
        global.document.addEventListener('keydown', onKeydown);
        global.document.addEventListener('click', function (ev) {
            var root = getRoot();
            if (!root || !root.classList.contains(OPEN_CLASS)) return;
            var act = ev.target.closest('[data-cfg-del-act]');
            if (!act) return;
            ev.preventDefault();
            ev.stopPropagation();
            finish(act.getAttribute('data-cfg-del-act') === 'confirm');
        }, true);
    }

    function confirm(opts) {
        opts = opts || {};
        var name = String(opts.name || '').trim() || '未命名';
        var root = ensureRoot();

        if (pendingResolve) finish(false);

        var titleEl = root.querySelector('[data-cfg-del-field="title"]');
        var messageEl = root.querySelector('[data-cfg-del-field="message"]');

        if (titleEl) titleEl.textContent = opts.title || '删除配置元件';
        if (messageEl) messageEl.textContent = '确定删除「' + name + '」吗？';

        return new Promise(function (resolve) {
            pendingResolve = resolve;
            global.document.body.classList.add('jms-cfg-del-confirm-lock');
            root.setAttribute('aria-hidden', 'false');
            global.requestAnimationFrame(function () {
                root.classList.add(OPEN_CLASS);
                var cancelBtn = root.querySelector('[data-cfg-del-act="cancel"]');
                if (cancelBtn) {
                    try { cancelBtn.focus({ preventScroll: true }); } catch (e) { cancelBtn.focus(); }
                }
            });
        });
    }

    global.JmsConfigDeleteConfirmUi = { confirm: confirm };
}(typeof window !== 'undefined' ? window : this));
