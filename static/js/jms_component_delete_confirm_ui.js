/**
 * 组件删除 · 统一确认弹窗（绿色玻璃风）
 */
(function (global) {
    'use strict';

    var ROOT_ID = 'jms-comp-del-confirm-root';
    var OPEN_CLASS = 'jms-comp-del-confirm--open';
    var UI_VERSION = '20260711compdel1';
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
        root.className = 'jms-comp-del-confirm';
        root.setAttribute('data-ui-version', UI_VERSION);
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'jms-comp-del-confirm-title');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML =
            '<div class="jms-comp-del-confirm__backdrop" data-comp-del-act="cancel"></div>' +
            '<div class="jms-comp-del-confirm__panel">' +
            '<div class="jms-comp-del-confirm__icon" aria-hidden="true">!</div>' +
            '<h2 id="jms-comp-del-confirm-title" class="jms-comp-del-confirm__title" data-comp-del-field="title">删除组件</h2>' +
            '<p class="jms-comp-del-confirm__message" data-comp-del-field="message"></p>' +
            '<div class="jms-comp-del-confirm__foot">' +
            '<button type="button" class="jms-comp-del-confirm__btn jms-comp-del-confirm__btn--ghost" data-comp-del-act="cancel">取消</button>' +
            '<button type="button" class="jms-comp-del-confirm__btn jms-comp-del-confirm__btn--danger" data-comp-del-act="confirm">删除</button>' +
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
        global.document.body.classList.remove('jms-comp-del-confirm-lock');
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
            var act = ev.target.closest('[data-comp-del-act]');
            if (!act) return;
            ev.preventDefault();
            ev.stopPropagation();
            finish(act.getAttribute('data-comp-del-act') === 'confirm');
        }, true);
    }

    function confirm(opts) {
        opts = opts || {};
        var name = String(opts.name || opts.label || '').trim() || '未命名';
        var root = ensureRoot();

        if (pendingResolve) finish(false);

        var titleEl = root.querySelector('[data-comp-del-field="title"]');
        var messageEl = root.querySelector('[data-comp-del-field="message"]');
        var title = opts.title || '删除组件';
        var message = opts.message || ('确定删除「' + name + '」吗？此操作不可撤销。');

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;

        var confirmBtn = root.querySelector('[data-comp-del-act="confirm"]');
        if (confirmBtn) confirmBtn.textContent = opts.confirmText || '删除';

        return new Promise(function (resolve) {
            pendingResolve = resolve;
            global.document.body.classList.add('jms-comp-del-confirm-lock');
            root.setAttribute('aria-hidden', 'false');
            global.requestAnimationFrame(function () {
                root.classList.add(OPEN_CLASS);
                var cancelBtn = root.querySelector('[data-comp-del-act="cancel"]');
                if (cancelBtn) {
                    try { cancelBtn.focus({ preventScroll: true }); } catch (e) { cancelBtn.focus(); }
                }
            });
        });
    }

    global.JmsComponentDeleteConfirmUi = { confirm: confirm };
}(typeof window !== 'undefined' ? window : this));
