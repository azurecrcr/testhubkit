/**
 * 线程组监听器 · 全量 catalog 桥接（ViewResultsFullVisualizer / StatVisualizer / BackendListener）
 * Phase10：统一 TG 级监听器为 catalog_element，兼容旧 tg.listeners 读写。
 */
(function (global) {
    'use strict';

    var LISTENER_REGISTRY = {
        view_results_tree: {
            alias: 'ViewResultsFullVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'ViewResultsFullVisualizer',
            category: 'listener',
            label_zh: '查看结果树',
            legacyTgKey: 'view_results_tree',
            catalogModule: 'JmsTgViewResultsTreeCatalog'
        },
        aggregate_report: {
            alias: 'StatVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'StatVisualizer',
            category: 'listener',
            label_zh: '聚合报告',
            legacyTgKey: 'aggregate_report',
            catalogModule: 'JmsTgAggregateReportCatalog'
        },
        backend_listener: {
            alias: 'BackendListener',
            testclass: 'BackendListener',
            guiclass: 'BackendListenerGui',
            category: 'listener',
            label_zh: 'InfluxDB Backend Listener',
            legacyTgKey: 'backend_listener',
            catalogModule: 'JmsBackendListenerCatalog'
        }
    };

    var KEYS = ['view_results_tree', 'aggregate_report', 'backend_listener'];

    function vb() { return global.JmsVisualBuilder; }
    function editor() { return global.JmsCatalogElementEditorUi; }

    function findPlan(model, planId) {
        return (model.test_plans || []).find(function (p) {
            return p && String(p.id) === String(planId);
        });
    }

    function findTg(model, planId, tgId) {
        var plan = findPlan(model, planId);
        if (!plan) return null;
        return (plan.thread_groups || []).find(function (t) {
            return t && String(t.id) === String(tgId);
        });
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
        });
    }

    function registryForKey(key) {
        return LISTENER_REGISTRY[key] || null;
    }

    function aliasForKey(key) {
        var reg = registryForKey(key);
        return reg ? reg.alias : key;
    }

    function findListenerCatalogStep(tg, keyOrAlias, includeDisabled) {
        var alias = registryForKey(keyOrAlias) ? aliasForKey(keyOrAlias) : keyOrAlias;
        var found = null;
        walkSteps(tg && tg.steps, function (s) {
            if (found) return;
            if (s && s.type === 'catalog_element' && s.alias === alias) {
                if (includeDisabled || s.enabled !== false) found = s;
            }
        });
        if (!found && !includeDisabled) {
            walkSteps(tg && tg.steps, function (s) {
                if (found) return;
                if (s && s.type === 'catalog_element' && s.alias === alias) found = s;
            });
        }
        return found;
    }

    function hasListenerCatalogStep(tg, key) {
        return !!findListenerCatalogStep(tg, key, true);
    }

    function uid() {
        return 'cat_' + Math.random().toString(36).slice(2, 10);
    }

    function catalogModuleForKey(key) {
        var reg = registryForKey(key);
        return reg ? global[reg.catalogModule] : null;
    }

    function normalizeProps(key, tg) {
        var mod = catalogModuleForKey(key);
        var reg = registryForKey(key);
        if (!mod || typeof mod.normalizeConfig !== 'function') {
            return { name: reg ? reg.label_zh : key, enabled: true };
        }
        if (tg && reg && tg[reg.legacyTgKey]) {
            return mod.normalizeConfig(tg[reg.legacyTgKey]);
        }
        var step = findListenerCatalogStep(tg, key, true);
        if (step && step.catalog_props) {
            return mod.normalizeConfig(step.catalog_props);
        }
        return mod.normalizeConfig({});
    }

    function buildListenerStep(key, tg) {
        var reg = registryForKey(key);
        if (!reg) return null;
        var props = normalizeProps(key, tg);
        return {
            id: uid(),
            type: 'catalog_element',
            name: props.name || reg.label_zh,
            enabled: props.enabled !== false,
            alias: reg.alias,
            testclass: reg.testclass,
            guiclass: reg.guiclass,
            category: reg.category,
            label_zh: reg.label_zh,
            container: false,
            scope: 'unified',
            catalog_props: props,
            jmx_fragment: ''
        };
    }

    function ensureListenerStep(planId, tgId, key) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return null;
        var tg = findTg(visual.getModel(), planId, tgId);
        if (!tg || !registryForKey(key)) return null;
        var step = findListenerCatalogStep(tg, key, true);
        if (step) {
            step.enabled = true;
            return step;
        }
        step = buildListenerStep(key, tg);
        if (!Array.isArray(tg.steps)) tg.steps = [];
        tg.steps.unshift(step);
        syncLegacyListenerFields(tg);
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        return step;
    }

    function removeListenerStepFromList(list, alias) {
        if (!Array.isArray(list)) return false;
        var removed = false;
        var i;
        for (i = list.length - 1; i >= 0; i--) {
            var s = list[i];
            if (s && s.type === 'catalog_element' && s.alias === alias) {
                list.splice(i, 1);
                removed = true;
            }
        }
        return removed;
    }

    function disableListenerCatalog(tg, key) {
        if (!tg || !registryForKey(key)) return false;
        var reg = registryForKey(key);
        removeListenerStepFromList(tg.steps, reg.alias);
        if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
        tg.listeners[key] = false;
        delete tg[reg.legacyTgKey];
        return true;
    }

    function isListenerEnabled(tg, key) {
        var step = findListenerCatalogStep(tg, key, false);
        if (step) return step.enabled !== false;
        return !!(tg && tg.listeners && tg.listeners[key]);
    }

    function getListenerFlags(tg) {
        return {
            view_results_tree: isListenerEnabled(tg, 'view_results_tree'),
            aggregate_report: isListenerEnabled(tg, 'aggregate_report'),
            backend_listener: isListenerEnabled(tg, 'backend_listener')
        };
    }

    function syncLegacyListenerFields(tg) {
        if (!tg) return;
        if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
        KEYS.forEach(function (key) {
            var reg = registryForKey(key);
            var step = findListenerCatalogStep(tg, key, true);
            if (step && step.enabled !== false) {
                tg.listeners[key] = true;
                tg[reg.legacyTgKey] = Object.assign({}, step.catalog_props || {});
            } else {
                tg.listeners[key] = false;
                if (!step) delete tg[reg.legacyTgKey];
            }
        });
    }

    function getListenerConfig(tg, key) {
        var step = findListenerCatalogStep(tg, key, true);
        if (step && step.catalog_props) return step.catalog_props;
        var reg = registryForKey(key);
        if (reg && tg && tg[reg.legacyTgKey]) return tg[reg.legacyTgKey];
        return normalizeProps(key, tg);
    }

    function setListenerEnabled(planId, tgId, key, enabled) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var tg = findTg(visual.getModel(), planId, tgId);
        if (!tg || !registryForKey(key)) return false;
        if (enabled) {
            ensureListenerStep(planId, tgId, key);
            tg = findTg(visual.getModel(), planId, tgId);
            var LT = global.JmsTgListenerTimeline;
            if (LT && typeof LT.assignAppendTimelineOrder === 'function') {
                LT.assignAppendTimelineOrder(tg, key);
            }
        } else {
            disableListenerCatalog(tg, key);
        }
        syncLegacyListenerFields(tg);
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        return true;
    }

    function toggleListener(planId, tgId, key) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var tg = findTg(visual.getModel(), planId, tgId);
        if (!tg) return false;
        return setListenerEnabled(planId, tgId, key, !isListenerEnabled(tg, key));
    }

    function openListenerEditor(planId, tgId, listenerKey) {
        var Ed = editor();
        if (!Ed || typeof Ed.openForStep !== 'function') return false;
        var step = ensureListenerStep(planId, tgId, listenerKey);
        if (!step) return false;
        var visual = vb();
        if (visual && typeof visual.getModel === 'function') {
            var tg = findTg(visual.getModel(), planId, tgId);
            syncLegacyListenerFields(tg);
        }
        Ed.openForStep(planId, tgId, step, null);
        return true;
    }

    function openEditor(planId, tgId, listenerKey) {
        if (!registryForKey(listenerKey)) return false;
        return openListenerEditor(planId, tgId, listenerKey);
    }

    function omitLegacyTgListenerYaml(tg, tgOut) {
        if (!tg || !tgOut) return;
        KEYS.forEach(function (key) {
            if (!hasListenerCatalogStep(tg, key)) return;
            var reg = registryForKey(key);
            if (tgOut.listeners) delete tgOut.listeners[key];
            if (reg && reg.legacyTgKey) delete tgOut[reg.legacyTgKey];
        });
        if (tgOut.listeners) {
            var any = KEYS.some(function (k) { return !!tgOut.listeners[k]; });
            if (!any) delete tgOut.listeners;
        }
    }

    function syncAllThreadGroups(model) {
        if (!model) return;
        function walk(list) {
            (list || []).forEach(syncLegacyListenerFields);
        }
        walk(model.setup_thread_groups);
        walk(model.post_thread_groups);
        (model.test_plans || []).forEach(function (plan) {
            walk(plan.thread_groups);
        });
    }

    global.JmsTgListenerCatalogBridge = {
        LISTENER_REGISTRY: LISTENER_REGISTRY,
        KEYS: KEYS,
        openEditor: openEditor,
        openListenerEditor: openListenerEditor,
        ensureListenerStep: ensureListenerStep,
        ensureBackendListenerStep: function (planId, tgId) { return ensureListenerStep(planId, tgId, 'backend_listener'); },
        openBackendListenerEditor: function (planId, tgId) { return openEditor(planId, tgId, 'backend_listener'); },
        isListenerEnabled: isListenerEnabled,
        getListenerFlags: getListenerFlags,
        hasListenerCatalogStep: hasListenerCatalogStep,
        findListenerCatalogStep: findListenerCatalogStep,
        setListenerEnabled: setListenerEnabled,
        toggleListener: toggleListener,
        disableListenerCatalog: disableListenerCatalog,
        syncLegacyListenerFields: syncLegacyListenerFields,
        syncAllThreadGroups: syncAllThreadGroups,
        getListenerConfig: getListenerConfig,
        omitLegacyTgListenerYaml: omitLegacyTgListenerYaml
    };
})(typeof window !== 'undefined' ? window : this);
