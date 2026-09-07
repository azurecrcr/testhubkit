/**
 * JMX 导出 · catalog-first（独立模块，包装 JmxScenarioAdvanced.genStepsTreeXml）
 */
(function (global) {
    'use strict';

    function prepareSteps(steps) {
        var E = global.JmsCatalogStepsYamlExport;
        if (E && typeof E.prepareSteps === 'function') {
            return E.prepareSteps(steps || []);
        }
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.stepsListToCatalog === 'function') {
            return M.stepsListToCatalog(steps || []);
        }
        return steps || [];
    }

    function wrapGenStepsTreeXml() {
        var A = global.JmxScenarioAdvanced;
        if (!A || A.__catalogExportWrapped || typeof A.genStepsTreeXml !== 'function') return;
        var orig = A.genStepsTreeXml;
        A.genStepsTreeXml = function (steps, indent, helpers) {
            return orig.call(A, prepareSteps(steps), indent, helpers);
        };
        A.__catalogExportWrapped = true;
    }

    function init() {
        wrapGenStepsTreeXml();
    }

    global.JmsJmxExportCatalogGuard = {
        prepareSteps: prepareSteps,
        wrapGenStepsTreeXml: wrapGenStepsTreeXml,
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
