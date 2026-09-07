/**
 * 场景归一化 · 唯一入口（打开 YAML / JMX / 粘贴 时转 catalog，日常不再重复 migrate）
 */
(function (global) {
    'use strict';

    var MARK = '__catalog_normalized_v';

    function isNormalized(model) {
        return !!(model && model[MARK] === 1);
    }

    function markNormalized(model) {
        if (model) model[MARK] = 1;
        return model;
    }

    function clearNormalized(model) {
        if (model) delete model[MARK];
        return model;
    }

    function normalizeModel(model, opts) {
        opts = opts || {};
        if (!model) return model;
        if (!opts.force && isNormalized(model)) return model;

        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.migrateLegacyToCatalog === 'function') {
            global.JmsPlanCatalogResolve.migrateLegacyToCatalog(model);
        }
        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.migrateLegacySceneToCatalog === 'function') {
            global.JmsPlanCatalogResolve.migrateLegacySceneToCatalog(model);
        }

        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.migrateModel === 'function') {
            M.migrateModel(model);
        }

        if (global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.migrateModelMountHosts === 'function') {
            global.JmsMountCatalogBridge.migrateModelMountHosts(model);
        }
        if (global.JmsTgListenerCatalogBridge && typeof global.JmsTgListenerCatalogBridge.syncAllThreadGroups === 'function') {
            global.JmsTgListenerCatalogBridge.syncAllThreadGroups(model);
        }

        return markNormalized(model);
    }

    function normalizeScenarioData(scenario, opts) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        var B = global.JmsJmxImportCatalogBridge;
        var model = B && typeof B.scenarioToModel === 'function' ? B.scenarioToModel(scenario) : null;
        if (!model) return scenario;
        normalizeModel(model, opts || { force: true });
        if (B && typeof B.applyModelToScenario === 'function') {
            return B.applyModelToScenario(scenario, model);
        }
        return scenario;
    }

    global.JmsScenarioNormalize = {
        normalizeModel: normalizeModel,
        normalizeScenarioData: normalizeScenarioData,
        isNormalized: isNormalized,
        markNormalized: markNormalized,
        clearNormalized: clearNormalized
    };
})(typeof window !== 'undefined' ? window : this);
