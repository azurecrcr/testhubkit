/**
 * 线程组配置元件 · 步骤区/模型与 JMX 导出对齐（隔离模块）
 */
(function (global) {
    'use strict';

    var CONFIG_KEYS = ['http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'];

    function catalog() {
        return global.JmsTgConfigCatalog;
    }

    function isConfigTimelineActive(tg) {
        return !!(tg && (tg._config_timeline_active || tg.config_timeline_active));
    }

    function markConfigTimelineActive(tg) {
        if (tg) tg._config_timeline_active = true;
    }

    function removeConfigTypeFromHttpManagers(tg, typeKey) {
        if (!tg || !typeKey) return;
        if (!tg.http_managers || typeof tg.http_managers !== 'object') return;
        var mgr = tg.http_managers;
        if (mgr[typeKey] && typeof mgr[typeKey] === 'object') {
            mgr[typeKey].enabled = false;
        }
        if (Array.isArray(mgr.selected_types)) {
            mgr.selected_types = mgr.selected_types.filter(function (k) { return k !== typeKey; });
        }
    }

    function normalizeRemovedConfigTypes(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.filter(function (k) { return CONFIG_KEYS.indexOf(k) >= 0; });
    }

    function getRemovedConfigTypes(tg) {
        if (!tg) return [];
        return normalizeRemovedConfigTypes(tg._removed_config_types);
    }

    function isConfigTypeRemoved(tg, typeKey) {
        if (!tg || !typeKey) return false;
        return getRemovedConfigTypes(tg).indexOf(typeKey) >= 0;
    }

    function recordRemovedConfigType(tg, typeKey) {
        if (!tg || !typeKey || CONFIG_KEYS.indexOf(typeKey) < 0) return;
        markConfigTimelineActive(tg);
        var list = getRemovedConfigTypes(tg).slice();
        if (list.indexOf(typeKey) < 0) list.push(typeKey);
        tg._removed_config_types = list;
    }

    function purgeHttpManagerConfigData(mgr, typeKey) {
        if (!mgr || !typeKey || !mgr[typeKey] || typeof mgr[typeKey] !== 'object') return;
        var slice = mgr[typeKey];
        slice.enabled = false;
        if (typeKey === 'csv_data_set') {
            slice.filename = '';
            slice.variable_names = '';
            slice.file_content = '';
        }
    }

    function syncConfigItemRemoval(tg, item) {
        if (!tg || !item || !item.type) return;
        markConfigTimelineActive(tg);
        recordRemovedConfigType(tg, item.type);
        removeConfigTypeFromHttpManagers(tg, item.type);
        if (tg.http_managers) purgeHttpManagerConfigData(tg.http_managers, item.type);
    }

    function resolveExportConfigItems(tg) {
        var items = Array.isArray(tg && tg.config_items) ? tg.config_items : [];
        var F = global.JmsTgJmxExportFilter;
        if (F && typeof F.filterConfigItemsForExport === 'function') {
            return F.filterConfigItemsForExport(items);
        }
        var Cat = catalog();
        return items.filter(function (it) {
            if (!it || it._deleted) return false;
            if (Cat && typeof Cat.isPersistable === 'function') return Cat.isPersistable(it);
            return true;
        });
    }

    function cloneMgr(mgr) {
        if (!mgr || typeof mgr !== 'object') return mgr;
        var F = global.JmsTgJmxExportFilter;
        if (F && typeof F.filterHttpManagersForExport === 'function') {
            return F.filterHttpManagersForExport(mgr);
        }
        try {
            return JSON.parse(JSON.stringify(mgr));
        } catch (e) {
            return mgr;
        }
    }

    function stripHttpManagersByConfigItems(mgr, configItems, tg) {
        var out = cloneMgr(mgr);
        if (!out) return out;
        var items = configItems || [];
        var present = {};
        items.forEach(function (it) {
            if (it && it.type) present[it.type] = true;
        });

        var shouldStrip = items.length > 0 || isConfigTimelineActive(tg);
        if (!shouldStrip) return out;

        CONFIG_KEYS.forEach(function (key) {
            if (present[key]) return;
            if (out[key] && typeof out[key] === 'object') {
                out[key].enabled = false;
            }
        });
        if (Array.isArray(out.selected_types)) {
            out.selected_types = out.selected_types.filter(function (key) {
                return !!present[key] && out[key] && out[key].enabled !== false;
            });
        }
        return out;
    }

    function applyTgConfigExportFields(tg) {
        if (!tg || typeof tg !== 'object') return { config_items: [], http_managers: tg && tg.http_managers };
        var items = resolveExportConfigItems(tg);
        return {
            config_items: items,
            http_managers: stripHttpManagersByConfigItems(tg.http_managers, items, tg)
        };
    }

    function findModelTg(model, scenarioTg) {
        if (!model || !scenarioTg) return null;
        var name = scenarioTg.name ? String(scenarioTg.name) : '';
        var id = scenarioTg.id ? String(scenarioTg.id) : '';
        var lists = [model.setup_thread_groups, model.post_thread_groups];
        var i;
        for (i = 0; i < lists.length; i++) {
            var list = lists[i] || [];
            var hit = list.find(function (t) {
                return t && ((id && t.id === id) || (name && t.name === name));
            });
            if (hit) return hit;
        }
        var plans = model.test_plans || [];
        for (i = 0; i < plans.length; i++) {
            var tgs = (plans[i] && plans[i].thread_groups) || [];
            var hit2 = tgs.find(function (t) {
                return t && ((id && t.id === id) || (name && t.name === name));
            });
            if (hit2) return hit2;
        }
        return null;
    }

    function modelTgHasConfigTimeline(modelTg) {
        if (!modelTg) return false;
        if (isConfigTimelineActive(modelTg)) return true;
        return Array.isArray(modelTg.config_items) && modelTg.config_items.length > 0;
    }

    function mergeTgConfigFromModel(scenarioTg, modelTg) {
        if (!scenarioTg || !modelTg || !modelTgHasConfigTimeline(modelTg)) return scenarioTg;
        var exportFields = applyTgConfigExportFields(modelTg);
        scenarioTg.config_items = exportFields.config_items || [];
        scenarioTg.http_managers = exportFields.http_managers;
        if (isConfigTimelineActive(modelTg)) {
            scenarioTg.config_timeline_active = true;
            scenarioTg._config_timeline_active = true;
        }
        return scenarioTg;
    }

    function mergeScenarioFromVisualModel(scenario) {
        var vb = global.JmsVisualBuilder;
        if (!scenario || !vb || typeof vb.getModel !== 'function') return scenario;
        var model = vb.getModel();
        if (!model) return scenario;

        function walk(list) {
            return (list || []).map(function (tg) {
                var modelTg = findModelTg(model, tg);
                return modelTg ? mergeTgConfigFromModel(Object.assign({}, tg), modelTg) : tg;
            });
        }

        var out = Object.assign({}, scenario);
        out.setup_thread_groups = walk(scenario.setup_thread_groups);
        out.post_thread_groups = walk(scenario.post_thread_groups);
        if (Array.isArray(scenario.thread_groups)) {
            out.thread_groups = walk(scenario.thread_groups);
        }
        return out;
    }

    global.JmsTgConfigExportSync = {
        CONFIG_KEYS: CONFIG_KEYS,
        markConfigTimelineActive: markConfigTimelineActive,
        isConfigTimelineActive: isConfigTimelineActive,
        removeConfigTypeFromHttpManagers: removeConfigTypeFromHttpManagers,
        normalizeRemovedConfigTypes: normalizeRemovedConfigTypes,
        getRemovedConfigTypes: getRemovedConfigTypes,
        isConfigTypeRemoved: isConfigTypeRemoved,
        recordRemovedConfigType: recordRemovedConfigType,
        purgeHttpManagerConfigData: purgeHttpManagerConfigData,
        syncConfigItemRemoval: syncConfigItemRemoval,
        resolveExportConfigItems: resolveExportConfigItems,
        stripHttpManagersByConfigItems: stripHttpManagersByConfigItems,
        applyTgConfigExportFields: applyTgConfigExportFields,
        mergeTgConfigFromModel: mergeTgConfigFromModel,
        mergeScenarioFromVisualModel: mergeScenarioFromVisualModel
    };
}(typeof window !== 'undefined' ? window : this));
