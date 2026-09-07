/**
 * XPath 导出别名修复 · aux 调用 genXPathExtractorXml，模块仅导出 genXml
 */
(function (global) {
    'use strict';

    function patchXPathAliases() {
        var X = global.JmxXPathExtractor;
        if (!X) return;
        if (typeof X.genXml === 'function' && typeof X.genXPathExtractorXml !== 'function') {
            X.genXPathExtractorXml = X.genXml;
        }
        var J = global.JmxJsonPostProcessor;
        if (J && typeof J.genXml === 'function' && typeof J.genJsonPostProcessorXml !== 'function') {
            J.genJsonPostProcessorXml = J.genXml;
        }
        var R = global.JmxRegexExtractor;
        if (R && typeof R.genXml === 'function' && typeof R.genRegexExtractorXml !== 'function') {
            R.genRegexExtractorXml = R.genXml;
        }
    }

    function init() {
        patchXPathAliases();
    }

    global.JmsCatalogXpathExportAliasV1 = {
        patchXPathAliases: patchXPathAliases,
        init: init
    };

    init();
})(typeof window !== 'undefined' ? window : this);
