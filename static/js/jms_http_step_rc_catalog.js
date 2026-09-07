/**

 * HTTP 步骤 · ResultCollector 监听器配置目录（查看结果树 / 聚合报告，隔离模块）

 */

(function (global) {

    'use strict';



    var RcActions = global.JmsTgResultCollectorActions;



    var TYPE_META = {

        view_results_tree: { label: '查看结果树', file: 'view-results-tree.jtl' },

        aggregate_report: { label: '聚合报告', file: 'aggregate-report.jtl' }

    };



    function formatFilenameForDisplay(filename) {

        return RcActions && typeof RcActions.formatFilenameForDisplay === 'function'

            ? RcActions.formatFilenameForDisplay(filename)

            : String(filename || '').replace(/\$\{__P\(build,run\)\}/g, '{build}');

    }



    function applyConfigToListenerItem(item, cfg) {

        if (!item || !cfg) return item;

        item.name = cfg.name;

        item.comments = cfg.comments || '';

        item.filename = cfg.filename || '';

        item.log_errors_only = !!cfg.log_errors_only;

        item.log_success_only = !!cfg.log_success_only;

        item.enabled = cfg.enabled !== false;

        if (cfg.save_config) item.save_config = cfg.save_config;

        return item;

    }



    function defaultVrtConfig(ctx) {

        return {

            name: '查看结果树',

            comments: '',

            filename: '',

            log_errors_only: false,

            log_success_only: false,

            enabled: true,

            save_config: RcActions ? RcActions.defaultSaveConfig() : undefined

        };

    }



    function normalizeVrtConfig(raw, ctx) {

        if (!raw || typeof raw !== 'object') return defaultVrtConfig(ctx);

        var out = {

            name: String(raw.name || '查看结果树').trim() || '查看结果树',

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



    function configFromVrtListenerItem(item, ctx) {

        if (!item) return defaultVrtConfig(ctx);

        return normalizeVrtConfig({

            name: item.name,

            comments: item.comments,

            filename: item.filename,

            log_errors_only: item.log_errors_only,

            log_success_only: item.log_success_only,

            enabled: item.enabled,

            save_config: item.save_config

        }, ctx);

    }



    function vrtConfigToYamlFields(cfg) {

        var out = {};

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



    function defaultAggConfig(ctx) {

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



    function normalizeAggConfig(raw, ctx) {

        if (!raw || typeof raw !== 'object') return defaultAggConfig(ctx);

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



    function configFromAggListenerItem(item, ctx) {

        if (!item) return defaultAggConfig(ctx);

        return normalizeAggConfig({

            name: item.name,

            comments: item.comments,

            filename: item.filename,

            log_errors_only: item.log_errors_only,

            log_success_only: item.log_success_only,

            enabled: item.enabled,

            save_config: item.save_config

        }, ctx);

    }



    function aggConfigToYamlFields(cfg) {

        var out = {};

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



    global.JmsHttpStepRcCatalog = {

        TYPE_META: TYPE_META,

        formatFilenameForDisplay: formatFilenameForDisplay,

        applyConfigToListenerItem: applyConfigToListenerItem,

        defaultVrtConfig: defaultVrtConfig,

        normalizeVrtConfig: normalizeVrtConfig,

        configFromVrtListenerItem: configFromVrtListenerItem,

        vrtConfigToYamlFields: vrtConfigToYamlFields,

        defaultAggConfig: defaultAggConfig,

        normalizeAggConfig: normalizeAggConfig,

        configFromAggListenerItem: configFromAggListenerItem,

        aggConfigToYamlFields: aggConfigToYamlFields

    };

}(typeof window !== 'undefined' ? window : this));

