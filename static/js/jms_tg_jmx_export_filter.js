/**
 * 线程组 JMX 导出过滤器（隔离模块）
 * 仅导出步骤区域内已添加且未删除的组件；删除/关闭的不导出。
 * 线程组级 processors / variables：UI 显式添加或 YAML/时间线可见项均导出。
 */
(function (global) {
    'use strict';

    function isUiAddedProcessor(proc) {
        return !!(proc && proc._ui_added === true);
    }

    function isUiAddedTgVariables(tg) {
        return !!(tg && tg._variables_ui_added === true);
    }

    function shouldExportProcessorForTimeline(proc) {
        if (!proc || !proc.type || proc._deleted) return false;
        if (proc._timeline_export_skip === true) return false;
        return true;
    }

    function shouldExportTgVariablesForTimeline(tg, variables) {
        var obj = variablesToObject(variables);
        if (!Object.keys(obj).length) return false;
        if (tg && tg._variables_block && tg._variables_block.enabled === false) return false;
        var V = global.JmsTgVariablesTimelineUi;
        if (V && typeof V.isVariablesBlockActive === 'function' && !V.isVariablesBlockActive(tg)) {
            return false;
        }
        return true;
    }

    function filterListenersForExport(listeners) {
        var ls = listeners || {};
        var out = {};
        if (ls.view_results_tree === true) out.view_results_tree = true;
        if (ls.aggregate_report === true) out.aggregate_report = true;
        if (ls.backend_listener === true) out.backend_listener = true;
        return out;
    }

    function filterProcessorsForExport(processors) {
        return (processors || []).filter(function (proc) {
            return isUiAddedProcessor(proc) || shouldExportProcessorForTimeline(proc);
        });
    }

    function variablesToObject(variables) {
        if (!variables) return {};
        if (Array.isArray(variables)) {
            var out = {};
            variables.forEach(function (row) {
                var k = row && String(row.key || '').trim();
                if (!k) return;
                out[k] = row.value == null ? '' : String(row.value);
            });
            return out;
        }
        if (typeof variables === 'object') return Object.assign({}, variables);
        return {};
    }

    function filterVariablesForExport(variables, tg) {
        if (!isUiAddedTgVariables(tg) && !shouldExportTgVariablesForTimeline(tg, variables)) return {};
        var obj = variablesToObject(variables);
        Object.keys(obj).forEach(function (k) {
            if (!String(k).trim()) delete obj[k];
        });
        return obj;
    }

    function hasVariableEntries(variables, tg) {
        return Object.keys(filterVariablesForExport(variables, tg)).length > 0;
    }

    function filterHttpManagersForExport(mgr) {
        if (!mgr || typeof mgr !== 'object') return mgr;
        var out = JSON.parse(JSON.stringify(mgr));
        var selected = Array.isArray(out.selected_types) ? out.selected_types : null;

        function allowed(key) {
            if (!selected || !selected.length) {
                var block = out[key];
                return !!(block && block.enabled);
            }
            return selected.indexOf(key) >= 0 && out[key] && out[key].enabled;
        }

        ['http_defaults', 'header_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'].forEach(function (key) {
            if (!out[key]) return;
            if (!allowed(key)) out[key].enabled = false;
        });

        if (selected && selected.length) {
            out.selected_types = selected.filter(function (key) {
                return out[key] && out[key].enabled;
            });
        }
        return out;
    }

    function tgHasExplicitHeaderManager(tg) {
        if (!tg) return false;
        var Catalog = global.JmsTgConfigCatalog;
        if (Catalog && typeof Catalog.ensureConfigItems === 'function') {
            var items = Catalog.ensureConfigItems(tg);
            var i;
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                if (it && it.type === 'header_manager' && Catalog.isPersistable && Catalog.isPersistable(it)) return true;
            }
        }
        var hm = tg.http_managers && tg.http_managers.header_manager;
        if (!hm || !hm.enabled) return false;
        var selected = tg.http_managers.selected_types;
        if (Array.isArray(selected) && selected.length) {
            return selected.indexOf('header_manager') >= 0;
        }
        return true;
    }

    /** 不向线程组注入场景级 default_headers fallback */
    function defaultHeadersForTgExport(tg, planHeaders) {
        if (!tgHasExplicitHeaderManager(tg)) return null;
        var hm = tg.http_managers && tg.http_managers.header_manager;
        if (hm && hm.headers && typeof hm.headers === 'object') return hm.headers;
        return null;
    }

    function shouldExportInheritedDefaultHeaders(tg, planHeaders) {
        if (!planHeaders || typeof planHeaders !== 'object' || !Object.keys(planHeaders).length) return false;
        var Scope = global.JmsTgJmxExportTgScope;
        if (Scope && typeof Scope.shouldInjectThreadGroupDefaultHeaders === 'function') {
            return Scope.shouldInjectThreadGroupDefaultHeaders(tg, tg && tg.http_managers, planHeaders);
        }
        return false;
    }

    function filterConfigItemsForExport(configItems) {
        var Catalog = global.JmsTgConfigCatalog;
        return (configItems || []).filter(function (item) {
            if (!item || !item.type || item._deleted) return false;
            if (Catalog && typeof Catalog.isPersistable === 'function') return Catalog.isPersistable(item);
            return true;
        });
    }

    function sanitizeTgUiExportGate(tg) {
        if (!tg) return;
        if (Array.isArray(tg.processors)) {
            tg.processors = tg.processors.filter(function (proc) {
                return isUiAddedProcessor(proc) || shouldExportProcessorForTimeline(proc);
            });
        }
        if (!isUiAddedTgVariables(tg) && !shouldExportTgVariablesForTimeline(tg, tg.variables)) {
            tg.variables = [];
        }
    }

    function sanitizeModelUiExportGate(model) {
        if (!model) return;
        function walk(list) {
            (list || []).forEach(sanitizeTgUiExportGate);
        }
        walk(model.setup_thread_groups);
        walk(model.post_thread_groups);
        (model.test_plans || []).forEach(function (plan) {
            walk(plan.thread_groups);
        });
    }

    function exportHost() {
        return global.JmsTgJmxExportFilter || null;
    }

    function callProcessorFilter(list) {
        var host = exportHost();
        if (host && typeof host.filterProcessorsForExport === 'function') {
            return host.filterProcessorsForExport(list);
        }
        return filterProcessorsForExport(list);
    }

    function callVariablesFilter(variables, tg) {
        var host = exportHost();
        if (host && typeof host.filterVariablesForExport === 'function') {
            return host.filterVariablesForExport(variables, tg);
        }
        return filterVariablesForExport(variables, tg);
    }

    function prepareTgForJmxExport(tg) {
        if (!tg || typeof tg !== 'object') return tg;
        var out = Object.assign({}, tg);
        out.listeners = filterListenersForExport(tg.listeners);

        if (!out.listeners.backend_listener) {
            delete out.backend_listener;
        }

        if (!out.listeners.view_results_tree) delete out.view_results_tree;
        if (!out.listeners.aggregate_report) delete out.aggregate_report;

        out.processors = callProcessorFilter(tg.processors);
        out.variables = callVariablesFilter(tg.variables, tg);
        var Sync = global.JmsTgConfigExportSync;
        if (Sync && typeof Sync.applyTgConfigExportFields === 'function') {
            var cfgExport = Sync.applyTgConfigExportFields(tg);
            out.config_items = cfgExport.config_items || [];
            out.http_managers = cfgExport.http_managers;
        } else {
            out.http_managers = filterHttpManagersForExport(tg.http_managers);
            if (Array.isArray(tg.config_items)) {
                out.config_items = filterConfigItemsForExport(tg.config_items);
            }
        }

        if (Array.isArray(tg.assertions)) {
            out.assertions = tg.assertions.filter(function (a) {
                return a && a.type && !a._deleted;
            });
        }

        return out;
    }

    function mapThreadGroups(list) {
        return (list || []).map(prepareTgForJmxExport);
    }

    function prepareScenarioForJmxExport(data) {
        if (!data || typeof data !== 'object') return data;
        if (global.JmsTgConfigExportSync &&
            typeof global.JmsTgConfigExportSync.mergeScenarioFromVisualModel === 'function') {
            data = global.JmsTgConfigExportSync.mergeScenarioFromVisualModel(data);
        }
        var out = Object.assign({}, data);
        out.setup_thread_groups = mapThreadGroups(data.setup_thread_groups);
        out.post_thread_groups = mapThreadGroups(data.post_thread_groups);
        if (Array.isArray(data.thread_groups)) {
            out.thread_groups = mapThreadGroups(data.thread_groups);
        }
        if (Array.isArray(data.test_plans)) {
            out.test_plans = data.test_plans.map(function (plan) {
                var p = Object.assign({}, plan);
                if (Array.isArray(plan.thread_groups)) {
                    p.thread_groups = mapThreadGroups(plan.thread_groups);
                }
                return p;
            });
        }
        return out;
    }

    function patchProcessorsExport() {
        var Adv = global.JmxScenarioAdvanced;
        if (!Adv || typeof Adv.genProcessorsXml !== 'function') return;
        if (!Adv.__jmxExportFilterOrigGenProcessorsXml) {
            Adv.__jmxExportFilterOrigGenProcessorsXml = Adv.genProcessorsXml;
        }
        var orig = Adv.__jmxExportFilterOrigGenProcessorsXml;
        Adv.genProcessorsXml = function (list, indent, escapeXml) {
            var filtered = callProcessorFilter(list);
            return orig.call(Adv, filtered, indent, escapeXml);
        };
        Adv.__jmxExportFilterPatched = true;
    }

    function findTgInModel(model, planId, tgId) {
        if (!model || !tgId) return null;
        var tg = (model.setup_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        tg = (model.post_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var plan = (model.test_plans || []).find(function (p) { return !planId || p.id === planId; });
        if (!plan) return null;
        return (plan.thread_groups || []).find(function (t) { return t.id === tgId; }) || null;
    }

    function markLastTgProcessorUiAdded(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return;
        var tg = findTgInModel(vb.getModel(), planId, tgId);
        if (!tg || !Array.isArray(tg.processors) || !tg.processors.length) return;
        var last = tg.processors[tg.processors.length - 1];
        if (last) last._ui_added = true;
    }

    function bindProcessorUiAddGate() {
        if (!global.document || !global.document.body) return;
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgProcessorUiExportGate === '1') return;
        root.dataset.jmsTgProcessorUiExportGate = '1';
        root.addEventListener('click', function (ev) {
            var addBtn = ev.target && ev.target.closest ? ev.target.closest('.jms-btn-add-tg-processor') : null;
            if (!addBtn) return;
            var planId = addBtn.getAttribute('data-plan-id');
            var tgId = addBtn.getAttribute('data-tg-id');
            global.setTimeout(function () { markLastTgProcessorUiAdded(planId, tgId); }, 0);
        }, true);
    }

    function tryPatch() {
        patchProcessorsExport();
        bindProcessorUiAddGate();
    }

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', tryPatch);
        } else {
            tryPatch();
        }
        if (global.addEventListener) global.addEventListener('load', tryPatch);
    } else {
        tryPatch();
    }

    global.JmsTgJmxExportFilter = {
        __jmxExportFilterHost: true,
        isUiAddedProcessor: isUiAddedProcessor,
        isUiAddedTgVariables: isUiAddedTgVariables,
        shouldExportProcessorForTimeline: shouldExportProcessorForTimeline,
        shouldExportTgVariablesForTimeline: shouldExportTgVariablesForTimeline,
        filterListenersForExport: filterListenersForExport,
        filterProcessorsForExport: filterProcessorsForExport,
        filterVariablesForExport: filterVariablesForExport,
        hasVariableEntries: hasVariableEntries,
        filterHttpManagersForExport: filterHttpManagersForExport,
        defaultHeadersForTgExport: defaultHeadersForTgExport,
        shouldExportInheritedDefaultHeaders: shouldExportInheritedDefaultHeaders,
        filterConfigItemsForExport: filterConfigItemsForExport,
        sanitizeTgUiExportGate: sanitizeTgUiExportGate,
        sanitizeModelUiExportGate: sanitizeModelUiExportGate,
        prepareTgForJmxExport: prepareTgForJmxExport,
        prepareScenarioForJmxExport: prepareScenarioForJmxExport,
        markLastTgProcessorUiAdded: markLastTgProcessorUiAdded
    };
}(typeof window !== 'undefined' ? window : this));
