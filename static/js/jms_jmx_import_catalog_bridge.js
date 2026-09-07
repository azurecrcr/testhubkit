/**
 * JMX 导入/导出 · scenario 数据 catalog 化（独立模块，包装 JmxImportParser 不修改其核心）
 */
(function (global) {
    'use strict';

    function scenarioToModel(scenario) {
        if (!scenario || typeof scenario !== 'object') return null;
        return {
            base_url: scenario.base_url,
            env: scenario.env,
            build: scenario.build,
            serialize_threadgroups: scenario.serialize_threadgroups,
            execution_mode: scenario.execution_mode,
            default_headers: scenario.default_headers,
            influxdb: scenario.influxdb,
            test_plans: [{
                name: scenario.name || 'API Scenario',
                thread_groups: JSON.parse(JSON.stringify(scenario.thread_groups || []))
            }],
            setup_thread_groups: JSON.parse(JSON.stringify(scenario.setup_thread_groups || [])),
            post_thread_groups: JSON.parse(JSON.stringify(scenario.post_thread_groups || [])),
            plan_catalog_items: JSON.parse(JSON.stringify(scenario.plan_catalog_items || []))
        };
    }

    function purgeTgLegacy(tg) {
        if (!tg || typeof tg !== 'object') return;
        delete tg.listeners;
        delete tg.view_results_tree;
        delete tg.aggregate_report;
        delete tg.backend_listener;
        delete tg.http_managers;
        delete tg.config_items;
        delete tg._config_timeline_active;
        delete tg._removed_config_types;
    }

    function applyModelToScenario(scenario, model) {
        if (!scenario || !model) return scenario;
        var plan = (model.test_plans || [])[0];
        if (plan && Array.isArray(plan.thread_groups)) {
            scenario.thread_groups = plan.thread_groups;
        }
        scenario.setup_thread_groups = model.setup_thread_groups || [];
        scenario.post_thread_groups = model.post_thread_groups || [];
        if (Array.isArray(model.plan_catalog_items)) {
            scenario.plan_catalog_items = model.plan_catalog_items;
        }
        (scenario.thread_groups || []).forEach(purgeTgLegacy);
        (scenario.setup_thread_groups || []).forEach(purgeTgLegacy);
        (scenario.post_thread_groups || []).forEach(purgeTgLegacy);
        delete scenario.plan_listeners;
        return scenario;
    }

    function prepareScenario(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        var N = global.JmsScenarioNormalize;
        if (N && typeof N.normalizeScenarioData === 'function') {
            return N.normalizeScenarioData(scenario, { force: true });
        }
        var M = global.JmsCatalogUnifyMigrate;
        if (!M || typeof M.migrateModel !== 'function') return scenario;
        var model = scenarioToModel(scenario);
        if (!model) return scenario;
        M.migrateModel(model);
        return applyModelToScenario(scenario, model);
    }

    function prepareScenarioData(data) {
        return prepareScenario(data);
    }

    function wrapParserExports() {
        var P = global.JmxImportParser;
        if (!P || P.__catalogBridgeWrapped) return;
        var origParse = P.parseJmxXml;
        var origYaml = P.scenarioToYaml;
        if (typeof origParse === 'function') {
            P.parseJmxXml = function (xml, opts) {
                return prepareScenario(origParse.call(P, xml, opts));
            };
        }
        if (typeof origYaml === 'function') {
            P.scenarioToYaml = function (scenario) {
                return origYaml.call(P, prepareScenario(scenario));
            };
        }
        P.__catalogBridgeWrapped = true;
    }

    function init() {
        wrapParserExports();
    }

    global.JmsJmxImportCatalogBridge = {
        prepareScenario: prepareScenario,
        prepareScenarioData: prepareScenarioData,
        scenarioToModel: scenarioToModel,
        applyModelToScenario: applyModelToScenario,
        wrapParserExports: wrapParserExports,
        init: init
    };

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', init);
        } else {
            setTimeout(init, 0);
        }
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
