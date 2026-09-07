/**
 * 线程组 · 用户定义的变量组件 · 删除确认弹窗（隔离模块）
 */
(function (global) {
    'use strict';

    var ROOT_ID = 'jms-tg-vars-del-confirm-root';
    var OPEN_CLASS = 'jms-tg-vars-del-confirm--open';
    var pendingResolve = null;
    var bound = false;

    function getRoot() {
        return global.document.getElementById(ROOT_ID);
    }

    function ensureRoot() {
        var root = getRoot();
        if (root) return root;

        root = global.document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'jms-tg-vars-del-confirm';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'jms-tg-vars-del-confirm-title');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML =
            '<div class="jms-tg-vars-del-confirm__backdrop" data-tg-vars-del-act="cancel"></div>' +
            '<div class="jms-tg-vars-del-confirm__panel">' +
            '<h2 id="jms-tg-vars-del-confirm-title" class="jms-tg-vars-del-confirm__title">删除用户定义的变量</h2>' +
            '<p class="jms-tg-vars-del-confirm__message" data-tg-vars-del-field="message"></p>' +
            '<div class="jms-tg-vars-del-confirm__foot">' +
            '<button type="button" class="jms-tg-vars-del-confirm__btn jms-tg-vars-del-confirm__btn--ghost" data-tg-vars-del-act="cancel">取消</button>' +
            '<button type="button" class="jms-tg-vars-del-confirm__btn jms-tg-vars-del-confirm__btn--danger" data-tg-vars-del-act="confirm">删除</button>' +
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
        global.document.body.classList.remove('jms-tg-vars-del-confirm-lock');
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
            var act = ev.target.closest('[data-tg-vars-del-act]');
            if (!act) return;
            ev.preventDefault();
            ev.stopPropagation();
            finish(act.getAttribute('data-tg-vars-del-act') === 'confirm');
        }, true);
    }

    function buildMessage(opts) {
        opts = opts || {};
        var tgName = String(opts.tgName || '').trim();
        if (tgName) {
            return '确定删除线程组「' + tgName + '」内的「用户定义的变量」组件吗？删除后该线程组变量将清空。';
        }
        return '确定删除「用户定义的变量」组件吗？删除后该线程组变量将清空。';
    }

    function confirmComponent(opts) {
        var root = ensureRoot();
        if (pendingResolve) finish(false);

        var messageEl = root.querySelector('[data-tg-vars-del-field="message"]');
        if (messageEl) messageEl.textContent = buildMessage(opts);

        return new Promise(function (resolve) {
            pendingResolve = resolve;
            global.document.body.classList.add('jms-tg-vars-del-confirm-lock');
            root.setAttribute('aria-hidden', 'false');
            global.requestAnimationFrame(function () {
                root.classList.add(OPEN_CLASS);
                var cancelBtn = root.querySelector('[data-tg-vars-del-act="cancel"]');
                if (cancelBtn) {
                    try { cancelBtn.focus({ preventScroll: true }); } catch (e) { cancelBtn.focus(); }
                }
            });
        });
    }

    global.JmsTgVariablesDeleteConfirmUi = { confirmComponent: confirmComponent };
}(typeof window !== 'undefined' ? window : this));
