/**
 * 线程组 · 聚合报告监听器配置目录（隔离模块）
 */
(function (global) {
    'use strict';

    var RcActions = global.JmsTgResultCollectorActions;

    function defaultConfig(ctx) {
        return {
            name: '聚合报告',
            comments: '',
            filename: '',
            log_errors_only: false,
            log_success_only: false,
            enabled: true,
            save_config: RcActions ? RcActions.defaultSaveConfig() : undefined
        };
    }

    function normalizeConfig(raw, ctx) {
        if (!raw || typeof raw !== 'object') return defaultConfig(ctx);
        var out = {
            name: String(raw.name || '聚合报告').trim() || '聚合报告',
            comments: raw.comments != null ? String(raw.comments) : '',
            filename: raw.filename != null ? String(raw.filename).trim() : '',
            log_errors_only: !!raw.log_errors_only,
            log_success_only: !!raw.log_success_only,
            enabled: raw.enabled !== false
        };
        if (RcActions) {
            out.save_config = RcActions.normalizeSaveConfig(raw.save_config);
        }
        return out;
    }

    function configToYaml(cfg) {
        cfg = normalizeConfig(cfg);
        var out = { name: cfg.name };
        if (cfg.comments) out.comments = cfg.comments;
        if (cfg.filename) out.filename = cfg.filename;
        if (cfg.log_errors_only) out.log_errors_only = true;
        if (cfg.log_success_only) out.log_success_only = true;
        if (cfg.enabled === false) out.enabled = false;
        if (RcActions && cfg.save_config) {
            var scYaml = RcActions.saveConfigToYaml(cfg.save_config);
            if (scYaml) out.save_config = scYaml;
        }
        return out;
    }

    global.JmsTgAggregateReportCatalog = {
        defaultConfig: defaultConfig,
        normalizeConfig: normalizeConfig,
        configToYaml: configToYaml
    };
}(typeof window !== 'undefined' ? window : this));
