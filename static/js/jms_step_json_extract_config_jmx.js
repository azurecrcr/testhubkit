/**
 * HTTP 步骤配置元件 · JSON 提取器 · JMX 与数据规范化（隔离模块）
 */
(function (global) {
    'use strict';

    function defaultJsonPostConfigData() {
        return {
            enabled: false,
            name: '',
            comments: '',
            apply_to: 'main',
            apply_to_variable: '',
            var: '',
            json_path: '',
            match_numbers: '1',
            compute_concat: false,
            default_value: ''
        };
    }

    function normalizeApplyTo(val) {
        var v = val ? String(val) : 'main';
        if (v === 'all' || v === 'main' || v === 'sub' || v === 'variable') return v;
        return 'main';
    }

    function normalizeJsonPostConfig(raw) {
        var def = defaultJsonPostConfigData();
        if (!raw || typeof raw !== 'object') return def;
        return {
            enabled: !!raw.enabled,
            name: raw.name !== undefined ? String(raw.name) : '',
            comments: raw.comments !== undefined ? String(raw.comments) : '',
            apply_to: normalizeApplyTo(raw.apply_to),
            apply_to_variable: raw.apply_to_variable !== undefined ? String(raw.apply_to_variable) : '',
            var: raw.var !== undefined ? String(raw.var) : '',
            json_path: raw.json_path !== undefined ? String(raw.json_path) : '',
            match_numbers: raw.match_numbers !== undefined ? String(raw.match_numbers) : '1',
            compute_concat: !!raw.compute_concat,
            default_value: raw.default_value !== undefined ? String(raw.default_value) : ''
        };
    }

    function parseFromEl(node) {
        if (!node) return null;
        if (global.JmxJsonPostProcessor && typeof global.JmxJsonPostProcessor.parseElement === 'function') {
            var jp = global.JmxJsonPostProcessor.parseElement(node);
            if (!jp) return null;
            return normalizeJsonPostConfig(Object.assign({ enabled: true }, jp));
        }
        return null;
    }

    function procPayload(d) {
        d = normalizeJsonPostConfig(d);
        return {
            type: 'json_post',
            name: d.name || 'JSON提取器',
            enabled: d.enabled !== false,
            comments: d.comments,
            apply_to: d.apply_to,
            apply_to_variable: d.apply_to_variable,
            var: d.var,
            json_path: d.json_path,
            match_numbers: d.match_numbers,
            compute_concat: d.compute_concat,
            default_value: d.default_value
        };
    }

    function genXml(d, indent, escapeXml) {
        if (!d || !d.enabled) return '';
        if (global.JmxJsonPostProcessor && typeof global.JmxJsonPostProcessor.genXml === 'function') {
            return global.JmxJsonPostProcessor.genXml(procPayload(d), indent, escapeXml);
        }
        return '';
    }

    /** 导入后：配置元件已接管 JSON 提取器时，从 processors 去重 */
    function dedupeProcessorsAfterConfigImport(step) {
        if (!step || !Array.isArray(step.processors)) return;
        var Catalog = global.JmsHttpStepConfigCatalog;
        if (!Catalog || !Catalog.typeActive(step.http_managers || {}, 'json_post')) return;
        step.processors = step.processors.filter(function (p) {
            return !p || p.type !== 'json_post';
        });
        if (!step.processors.length) delete step.processors;
    }

    /** 导出时：配置元件已接管 JSON 提取器，跳过后置处理器中的 json_post */
    function patchSkipConfigJsonInProcessorExport() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._stepJsonCfgExportPatch) return;
        if (!adv._jsonPostSamplerPatch) {
            setTimeout(patchSkipConfigJsonInProcessorExport, 40);
            return;
        }
        var wrapped = adv.genSamplerChildrenAdvanced;
        if (typeof wrapped !== 'function') return;
        adv._stepJsonCfgExportPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var Catalog = global.JmsHttpStepConfigCatalog;
            var skipCfgJson = Catalog && Catalog.typeActive(st.http_managers || {}, 'json_post');
            if (!skipCfgJson) return wrapped.call(adv, st, childPad, helpers);
            var stCopy = Object.assign({}, st);
            stCopy.processors = (st.processors || []).filter(function (p) {
                return !p || p.type !== 'json_post';
            });
            return wrapped.call(adv, stCopy, childPad, helpers);
        };
    }

    function boot() {
        patchSkipConfigJsonInProcessorExport();
    }

    global.JmsStepJsonExtractConfigJmx = {
        defaultJsonPostConfigData: defaultJsonPostConfigData,
        normalizeJsonPostConfig: normalizeJsonPostConfig,
        parseFromEl: parseFromEl,
        genXml: genXml,
        dedupeProcessorsAfterConfigImport: dedupeProcessorsAfterConfigImport,
        patchSkipConfigJsonInProcessorExport: patchSkipConfigJsonInProcessorExport
    };

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));
