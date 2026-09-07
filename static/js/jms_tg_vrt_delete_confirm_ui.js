/**
 * 查看结果树 · 删除确认弹窗（隔离模块 v2）
 */
(function (global) {
    'use strict';

    var ROOT_ID = 'jms-vrt-del-confirm-root';
    var OPEN_CLASS = 'jms-vrt-del-confirm--open';
    var UI_VERSION = '20260703vrtdel3';
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
        root.className = 'jms-vrt-del-confirm';
        root.setAttribute('data-ui-version', UI_VERSION);
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'jms-vrt-del-confirm-title');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML =
            '<div class="jms-vrt-del-confirm__backdrop" data-vrt-del-act="cancel"></div>' +
            '<div class="jms-vrt-del-confirm__panel">' +
            '<div class="jms-vrt-del-confirm__head">' +
            '<h2 id="jms-vrt-del-confirm-title" class="jms-vrt-del-confirm__title" data-vrt-del-field="title">删除查看结果树</h2>' +
            '<button type="button" class="jms-vrt-del-confirm__close" data-vrt-del-act="cancel" aria-label="关闭">×</button>' +
            '</div>' +
            '<p class="jms-vrt-del-confirm__message" data-vrt-del-field="message"></p>' +
            '<div class="jms-vrt-del-confirm__foot">' +
            '<button type="button" class="jms-vrt-del-confirm__btn jms-vrt-del-confirm__btn--ghost" data-vrt-del-act="cancel">取消</button>' +
            '<button type="button" class="jms-vrt-del-confirm__btn jms-vrt-del-confirm__btn--danger" data-vrt-del-act="confirm">删除</button>' +
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
        global.document.body.classList.remove('jms-vrt-del-confirm-lock');
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
            var act = ev.target.closest('[data-vrt-del-act]');
            if (!act) return;
            ev.preventDefault();
            ev.stopPropagation();
            finish(act.getAttribute('data-vrt-del-act') === 'confirm');
        }, true);
    }

    function confirm(opts) {
        opts = opts || {};
        var name = String(opts.name || '').trim() || '未命名';
        var root = ensureRoot();

        if (pendingResolve) finish(false);

        var titleEl = root.querySelector('[data-vrt-del-field="title"]');
        var messageEl = root.querySelector('[data-vrt-del-field="message"]');
        if (titleEl) titleEl.textContent = opts.title || '删除查看结果树';
        if (messageEl) messageEl.textContent = '确定删除「' + name + '」吗？';

        return new Promise(function (resolve) {
            pendingResolve = resolve;
            global.document.body.classList.add('jms-vrt-del-confirm-lock');
            root.setAttribute('aria-hidden', 'false');
            global.requestAnimationFrame(function () {
                root.classList.add(OPEN_CLASS);
                var cancelBtn = root.querySelector('.jms-vrt-del-confirm__foot [data-vrt-del-act="cancel"]');
                if (cancelBtn) {
                    try { cancelBtn.focus({ preventScroll: true }); } catch (e) { cancelBtn.focus(); }
                }
            });
        });
    }

    global.JmsTgVrtDeleteConfirmUi = { confirm: confirm };
}(typeof window !== 'undefined' ? window : this));
