/**
 * JDBC PostProcessor · 保存校验提示（隔离模块，仅 TG/HTTP JDBC 弹窗）
 */
(function (global) {
    'use strict';

    var NOTICE_CLASS = 'jms-jdbc-vn';
    var PULSE_CLASS = 'jms-jdbc-vn__field--pulse';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getHostPanel(modal) {
        if (!modal) return null;
        return modal.querySelector('.jms-step-modal')
            || modal.querySelector('.jms-tg-jdbc-post-drawer__panel')
            || modal.querySelector('.jms-http-jdbc-proc-drawer__panel')
            || modal;
    }

    function dataSourceSelector(scope) {
        return scope === 'http'
            ? '[data-http-jdbc-proc-field="data_source"]'
            : '[data-tg-jdbc-field="data_source"]';
    }

    function clear(modal) {
        if (!modal) return;
        modal.querySelectorAll('.' + NOTICE_CLASS).forEach(function (el) {
            el.parentNode.removeChild(el);
        });
        modal.querySelectorAll('.' + PULSE_CLASS).forEach(function (el) {
            el.classList.remove(PULSE_CLASS);
        });
    }

    /**
     * @param {Object} opts
     * @param {HTMLElement} opts.modal
     * @param {string} opts.title
     * @param {string} opts.message
     * @param {string} [opts.hint]
     * @param {string} [opts.focusSelector]
     * @param {string} [opts.scope] - tg | http
     */
    function show(opts) {
        opts = opts || {};
        var modal = opts.modal;
        var host = getHostPanel(modal);
        if (!host) return false;
        clear(modal);

        var title = opts.title || '无法保存';
        var message = String(opts.message || '').trim();
        if (!message) return false;
        var hint = opts.hint ? String(opts.hint).trim() : '';
        var scope = opts.scope === 'http' ? 'http' : 'tg';

        var notice = global.document.createElement('div');
        notice.className = NOTICE_CLASS + ' jms-jdbc-vn--' + scope;
        notice.setAttribute('role', 'alert');
        notice.setAttribute('aria-live', 'assertive');
        notice.innerHTML =
            '<div class="jms-jdbc-vn__card">' +
            '<div class="jms-jdbc-vn__accent" aria-hidden="true"></div>' +
            '<div class="jms-jdbc-vn__main">' +
            '<div class="jms-jdbc-vn__icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<ellipse cx="12" cy="6" rx="7" ry="2.5" stroke="currentColor" stroke-width="1.5"/>' +
            '<path d="M5 6v12c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V6" stroke="currentColor" stroke-width="1.5"/>' +
            '<path d="M5 12c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5" stroke="currentColor" stroke-width="1.5"/>' +
            '</svg></div>' +
            '<div class="jms-jdbc-vn__copy">' +
            '<div class="jms-jdbc-vn__title">' + esc(title) + '</div>' +
            '<div class="jms-jdbc-vn__message">' + esc(message) + '</div>' +
            (hint ? '<div class="jms-jdbc-vn__hint">' + esc(hint) + '</div>' : '') +
            '</div></div>' +
            '<button type="button" class="jms-jdbc-vn__action">继续填写</button>' +
            '</div>';

        host.appendChild(notice);
        var actionBtn = notice.querySelector('.jms-jdbc-vn__action');
        if (actionBtn) {
            actionBtn.addEventListener('click', function () { clear(modal); });
        }

        var focusSelector = opts.focusSelector || dataSourceSelector(scope);
        var target = modal.querySelector(focusSelector);
        if (target) {
            target.classList.add(PULSE_CLASS);
            global.setTimeout(function () {
                try {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (e) {
                    target.scrollIntoView(true);
                }
                try {
                    target.focus({ preventScroll: true });
                } catch (e2) {
                    target.focus();
                }
            }, 90);
        }

        global.requestAnimationFrame(function () {
            notice.classList.add('is-visible');
        });
        if (actionBtn) {
            global.setTimeout(function () {
                try { actionBtn.focus({ preventScroll: true }); } catch (e) { actionBtn.focus(); }
            }, 140);
        }
        return true;
    }

    function notifyDataSourceRequired(modal, scope) {
        return show({
            modal: modal,
            title: '缺少连接池变量名',
            message: '保存前请填写 Variable Name of Pool。',
            hint: '填写 JDBC Connection Configuration 中已声明的连接池变量名，例如 dbConfig。',
            scope: scope || 'tg'
        });
    }

    global.JmsJdbcPostValidationNotice = {
        clear: clear,
        notifyDataSourceRequired: notifyDataSourceRequired
    };
}(typeof window !== 'undefined' ? window : this));
