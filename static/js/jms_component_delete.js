/**
 * 组件删除 · 统一确认入口（兼容旧 DeleteConfirmUi 别名）
 */
(function (global) {
    'use strict';

    function baseConfirm(opts) {
        opts = opts || {};
        var Ui = global.JmsComponentDeleteConfirmUi;
        if (Ui && typeof Ui.confirm === 'function') {
            return Ui.confirm(opts);
        }
        var name = String(opts.name || opts.label || '未命名').trim() || '未命名';
        var msg = opts.message || ('确定删除「' + name + '」吗？');
        return Promise.resolve(global.confirm(msg));
    }

    function shim(title) {
        return {
            confirm: function (opts) {
                opts = opts || {};
                return baseConfirm({
                    title: opts.title || title,
                    name: opts.name || opts.label,
                    message: opts.message,
                    confirmText: opts.confirmText
                });
            }
        };
    }

    global.JmsComponentDelete = {
        confirm: baseConfirm
    };

    global.JmsConfigDeleteConfirmUi = shim('删除配置元件');
    global.JmsTgBeanshellPpDeleteConfirmUi = shim('删除 BeanShell PostProcessor');
    global.JmsTgVrtDeleteConfirmUi = shim('删除查看结果树');
    global.JmsTgVariablesDeleteConfirmUi = shim('删除用户定义的变量');
}(typeof window !== 'undefined' ? window : this));
