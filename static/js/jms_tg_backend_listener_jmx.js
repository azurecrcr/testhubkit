/**
 * 线程组级 Backend Listener · JMX 导入/导出门控（隔离模块）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsBackendListenerCatalog;
    var BackendJmx = global.JmsBackendListenerJmx;

    function defaultTgListenersShape() {
        return { view_results_tree: false, aggregate_report: false, backend_listener: false };
    }

    function applyImportConfig(node, tg) {
        if (!node || (node.getAttribute('testclass') || '') !== 'BackendListener') return false;
        if (!tg.listeners) tg.listeners = defaultTgListenersShape();
        tg.listeners.backend_listener = node.getAttribute('enabled') !== 'false';
        if (BackendJmx && typeof BackendJmx.parseBackendListenerEl === 'function') {
            var cfg = BackendJmx.parseBackendListenerEl(node);
            if (cfg) tg.backend_listener = cfg;
        }
        return true;
    }

    /** 仅显式启用时导出（listeners.backend_listener === true） */
    function shouldExportExplicit(tgListeners) {
        var ls = tgListeners || {};
        if (ls.backend_listener === false) return false;
        return ls.backend_listener === true;
    }

    function shouldExport(tgListeners, listenerData) {
        return shouldExportExplicit(tgListeners);
    }

    function listenersToYaml(listeners, backendCfg) {
        var ls = listeners || {};
        var hasBackend = !!ls.backend_listener;
        if (!ls.view_results_tree && !ls.aggregate_report && !hasBackend) return null;
        var out = {};
        if (ls.view_results_tree) out.view_results_tree = true;
        if (ls.aggregate_report) out.aggregate_report = true;
        if (hasBackend) out.backend_listener = true;
        return out;
    }

    function backendConfigToYaml(cfg) {
        if (!cfg || !Catalog) return undefined;
        return Catalog.configToYaml(cfg);
    }

    global.JmsTgBackendListenerJmx = {
        applyImportConfig: applyImportConfig,
        shouldExport: shouldExport,
        shouldExportExplicit: shouldExportExplicit,
        listenersToYaml: listenersToYaml,
        backendConfigToYaml: backendConfigToYaml,
        defaultTgListenersShape: defaultTgListenersShape
    };
}(typeof window !== 'undefined' ? window : this));
