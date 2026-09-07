/**
 * YAML 导出前强制 catalog 迁移（独立模块）
 */
(function (global) {
    'use strict';

    function prepareModel(model) {
        if (!model) return model;
        var N = global.JmsScenarioNormalize;
        if (N && typeof N.normalizeModel === 'function') {
            return N.normalizeModel(model, { force: false });
        }
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.migrateModel === 'function') {
            M.migrateModel(model);
        }
        return model;
    }

    global.JmsCatalogYamlExportGuard = {
        prepareModel: prepareModel
    };
})(typeof window !== 'undefined' ? window : this);
