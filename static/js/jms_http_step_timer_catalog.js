/**
 * HTTP 步骤 · 固定定时器配置目录（隔离模块）
 */
(function (global) {
    'use strict';

    function defaultTimerData() {
        return {
            enabled: false,
            name: '固定定时器',
            comments: '',
            delay_ms: 300
        };
    }

    function normalizeTimer(cfg) {
        var d = defaultTimerData();
        if (!cfg || typeof cfg !== 'object') return d;
        var delay = cfg.delay_ms !== undefined ? Number(cfg.delay_ms) : (cfg.delay !== undefined ? Number(cfg.delay) : d.delay_ms);
        if (!Number.isFinite(delay) || delay < 0) delay = d.delay_ms;
        return {
            enabled: !!cfg.enabled,
            name: String(cfg.name != null ? cfg.name : d.name).trim() || d.name,
            comments: String(cfg.comments != null ? cfg.comments : ''),
            delay_ms: Math.floor(delay)
        };
    }

    global.JmsHttpStepTimerCatalog = {
        defaultTimerData: defaultTimerData,
        normalizeTimer: normalizeTimer
    };
}(typeof window !== 'undefined' ? window : this));
