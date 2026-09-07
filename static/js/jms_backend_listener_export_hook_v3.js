/**
 * Backend Listener export hook V3（export-only）
 */
(function (global) {
    'use strict';
    function installHookV3() {
        if (!global.__jmxExportMode) return;
        var C = global.JmsBackendListenerCatalog;
        if (!C || C.__eventTagsExportHookV3) return;
        var orig = C.defaultConfigFromListenerData;
        if (typeof orig !== 'function') return;
        C.defaultConfigFromListenerData = function (listenerData) {
            var cfg = orig(listenerData);
            var ET = global.JmsBackendListenerEventTagsV3 || global.JmsBackendListenerEventTagsV2;
            var root = global.__jmxExportRootData || {};
            if (ET && cfg && Array.isArray(cfg.parameters) && ET.applyToParameters) {
                cfg.parameters = ET.applyToParameters(cfg.parameters, listenerData, root);
            }
            return cfg;
        };
        C.__eventTagsExportHookV3 = true;
    }
    function patchCatalogBackendItem(item, rootData) {
        if (!item || item.alias !== 'BackendListener' && item.testclass !== 'BackendListener') return item;
        var ET = global.JmsBackendListenerEventTagsV3;
        if (!ET || !item.catalog_props) return item;
        var params = item.catalog_props.parameters || [];
        item.catalog_props.parameters = ET.applyToParameters(params, item.catalog_props, rootData || {});
        return item;
    }
    installHookV3();
    global.JmsBackendListenerExportHookV3 = { installHookV3: installHookV3, patchCatalogBackendItem: patchCatalogBackendItem };
}(typeof window !== 'undefined' ? window : this));
