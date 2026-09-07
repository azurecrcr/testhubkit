/**
 * YAML/JMX 导出前将步骤树统一为 catalog_element（独立模块）
 */
(function (global) {
    'use strict';

    function prepareSteps(list) {
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.stepsListToCatalog === 'function') {
            return M.stepsListToCatalog(list || []);
        }
        return list || [];
    }

    function prepareThreadGroup(tg) {
        if (!tg) return tg;
        var copy = tg;
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.migrateThreadGroup === 'function') {
            M.migrateThreadGroup(copy);
        }
        return copy;
    }

    global.JmsCatalogStepsYamlExport = {
        prepareSteps: prepareSteps,
        prepareThreadGroup: prepareThreadGroup
    };
})(typeof window !== 'undefined' ? window : this);
