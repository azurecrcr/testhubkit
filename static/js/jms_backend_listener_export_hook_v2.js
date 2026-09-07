/**
 * JMX 导出 · Backend Listener hook V2
 */
(function (global) {
    'use strict';
    function installHookV2() {
        var C = global.JmsBackendListenerCatalog;
        if (!C || C.__eventTagsExportHookV2) return;
        var orig = C.defaultConfigFromListenerData;
        if (typeof orig !== 'function') return;
        C.defaultConfigFromListenerData = function (listenerData) {
            var cfg = orig(listenerData);
            var ET = global.JmsBackendListenerEventTagsV2 || global.JmsBackendListenerEventTagsV1;
            var root = global.__jmxExportRootData || {};
            if (ET && cfg && Array.isArray(cfg.parameters)) {
                if (ET.applyToParameters) {
                    cfg.parameters = ET.applyToParameters(cfg.parameters, listenerData, root);
                }
            }
            return cfg;
        };
        C.__eventTagsExportHookV2 = true;
    }
    installHookV2();
    global.JmsBackendListenerExportHookV2 = { installHookV2: installHookV2 };
}(typeof window !== 'undefined' ? window : this));
