/**
 * JMX 导出 · Backend Listener eventTags 挂钩（隔离模块，不改 catalog 源文件）
 */
(function (global) {
    'use strict';
    function installHook() {
        var C = global.JmsBackendListenerCatalog;
        if (!C || C.__eventTagsExportHooked) return;
        var orig = C.defaultConfigFromListenerData;
        if (typeof orig !== 'function') return;
        C.defaultConfigFromListenerData = function (listenerData) {
            var cfg = orig(listenerData);
            var ET = global.JmsBackendListenerEventTagsV1;
            var root = global.__jmxExportRootData || {};
            if (ET && cfg && Array.isArray(cfg.parameters)) {
                cfg.parameters = ET.applyToParameters(cfg.parameters, listenerData, root);
            }
            return cfg;
        };
        C.__eventTagsExportHooked = true;
    }
    installHook();
    global.JmsBackendListenerExportHookV1 = { installHook: installHook };
}(typeof window !== 'undefined' ? window : this));
