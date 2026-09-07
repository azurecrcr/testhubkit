/**
 * 导出走 prepareScenarioData 时：禁止对非 JMX 保真场景无条件 sanitize。
 * 独立纠偏层（不改 genJmx / catalog bridge 核心），仅在已有保真标记或导入活动期 sanitize。
 */
(function (global) {
    'use strict';

    function hasFidelity(obj) {
        return !!(obj && obj._jmx_import_fidelity);
    }

    function fidelityActive(obj) {
        return hasFidelity(obj) || !!global.__jmxImportFidelityActive;
    }

    function rebindNormalize() {
        var N = global.JmsScenarioNormalize;
        if (!N || N.__exportFidelityGuardV1) return;
        N.__exportFidelityGuardV1 = true;

        var prevScenario = N.normalizeScenarioData;
        if (typeof prevScenario !== 'function') return;

        N.normalizeScenarioData = function (scenario, opts) {
            if (!scenario || typeof scenario !== 'object') return scenario;
            if (!fidelityActive(scenario)) {
                // 普通场景：走原始归一化，跳过保真 sanitize 包装链
                var B = global.JmsJmxImportCatalogBridge;
                var model = B && typeof B.scenarioToModel === 'function' ? B.scenarioToModel(scenario) : null;
                if (!model) return scenario;
                if (typeof N.normalizeModel === 'function') {
                    N.normalizeModel(model, opts || { force: true });
                }
                if (B && typeof B.applyModelToScenario === 'function') {
                    return B.applyModelToScenario(scenario, model);
                }
                return scenario;
            }
            return prevScenario.call(N, scenario, opts);
        };
    }

    function rebindBridgePrepare() {
        var B = global.JmsJmxImportCatalogBridge;
        if (!B || B.__exportFidelityGuardV1) return;
        B.__exportFidelityGuardV1 = true;

        B.prepareScenario = function (scenario) {
            if (!scenario || typeof scenario !== 'object') return scenario;
            var N = global.JmsScenarioNormalize;
            if (N && typeof N.normalizeScenarioData === 'function') {
                return N.normalizeScenarioData(scenario, { force: true });
            }
            return scenario;
        };
        B.prepareScenarioData = function (data) {
            return B.prepareScenario(data);
        };
    }

    function install() {
        rebindNormalize();
        rebindBridgePrepare();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', install);
    } else {
        setTimeout(install, 0);
    }

    global.JmsExportPrepareFidelityGuardV1 = { install: install };
})(typeof window !== 'undefined' ? window : this);
