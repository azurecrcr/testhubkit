/**
 * JMX 导出校验 · catalog 树形步骤识别（隔离模块，不改既有 normalizeHttpStep）
 */
(function (global) {
    'use strict';

    function walkSteps(steps, fn) {
        (steps || []).forEach(function (s) {
            if (!s) return;
            if (fn(s)) return true;
            if (s.container && Array.isArray(s.children) && walkSteps(s.children, fn)) return true;
            if (Array.isArray(s.catalog_hash_children) && walkSteps(s.catalog_hash_children, fn)) return true;
        });
        return false;
    }

    function shouldUseTreeNormalize(steps) {
        if (!Array.isArray(steps) || !steps.length) return false;
        if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.stepsNeedTreeXml === 'function') {
            if (global.JmxScenarioAdvanced.stepsNeedTreeXml(steps)) return true;
        }
        return walkSteps(steps, function (s) {
            if (s.type === 'catalog_element') return true;
            if (s.container) return true;
            if (s.type === 'if_controller' || s.type === 'debug_sampler' || s.type === 'beanshell_post') return true;
            if (Array.isArray(s.children) && s.children.length) return true;
            return false;
        });
    }

    global.JmsExportValidateStepsV1 = {
        shouldUseTreeNormalize: shouldUseTreeNormalize
    };
})(typeof window !== 'undefined' ? window : this);
