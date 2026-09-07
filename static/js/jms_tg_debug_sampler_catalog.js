/**
 * 线程组 · Debug Sampler 配置目录（字段对齐 JMeter GUI）
 */
(function (global) {
    'use strict';

    function defaultStepData(seq) {
        var suffix = seq > 1 ? ' ' + seq : '';
        return {
            type: 'debug_sampler',
            name: '调试取样器' + suffix,
            comments: '',
            display_jmeter_properties: false,
            display_jmeter_variables: true,
            display_system_properties: false,
            enabled: true
        };
    }

    function normalizeStep(raw) {
        if (!raw || raw.type !== 'debug_sampler') return null;
        return {
            type: 'debug_sampler',
            name: raw.name ? String(raw.name) : '调试取样器',
            comments: raw.comments !== undefined ? String(raw.comments) : '',
            display_jmeter_properties: !!raw.display_jmeter_properties,
            display_jmeter_variables: raw.display_jmeter_variables !== false,
            display_system_properties: !!raw.display_system_properties,
            enabled: raw.enabled !== false
        };
    }

    global.JmsTgDebugSamplerCatalog = {
        defaultStepData: defaultStepData,
        normalizeStep: normalizeStep
    };
}(typeof window !== 'undefined' ? window : this));
