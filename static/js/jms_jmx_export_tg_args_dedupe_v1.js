/**
 * JMX 导出 · 线程组已有 Arguments catalog 步骤时，跳过「线程组变量」自动写出，避免重复
 * 包装 helpers.genThreadGroupLocalVariablesXml，不改原函数体。
 */
(function (global) {
    'use strict';

    function wrapHelpers(helpers, plan) {
        if (!helpers || typeof helpers !== 'object') return helpers;
        var A = global.JmsJmxImportTgArgumentsStepV1;
        if (!A || typeof A.shouldSkipTgLocalVariablesExport !== 'function') return helpers;
        if (!A.shouldSkipTgLocalVariablesExport(plan)) return helpers;
        var out = Object.assign({}, helpers);
        var orig = helpers.genThreadGroupLocalVariablesXml;
        out.genThreadGroupLocalVariablesXml = function () { return ''; };
        out.__tgArgsDedupeV1 = true;
        out.__origGenThreadGroupLocalVariablesXml = orig;
        return out;
    }

    function patchScenarioAdvanced() {
        var Adv = global.JmxScenarioAdvanced;
        if (!Adv || Adv.__tgArgsDedupeV1 || typeof Adv.genThreadGroupLikeXml !== 'function') return;
        Adv.__tgArgsDedupeV1 = true;
        var orig = Adv.genThreadGroupLikeXml;
        Adv.genThreadGroupLikeXml = function (plan, bu, defaultHeaders, listenerData, tgLabel, opts) {
            opts = opts || {};
            var helpers = opts.helpers || {};
            opts = Object.assign({}, opts, { helpers: wrapHelpers(helpers, plan) });
            return orig.call(Adv, plan, bu, defaultHeaders, listenerData, tgLabel, opts);
        };
    }

    function install() {
        patchScenarioAdvanced();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', install);
    } else {
        setTimeout(install, 0);
    }

    global.JmsJmxExportTgArgsDedupeV1 = { install: install, wrapHelpers: wrapHelpers };
})(typeof window !== 'undefined' ? window : this);
