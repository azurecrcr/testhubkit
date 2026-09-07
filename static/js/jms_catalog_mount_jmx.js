/**
 * catalog 挂载区 hashTree 子项 JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function genMountItemsXml(list, indent, helpers) {
        if (!list || !list.length) return '';
        var R = global.JmsCatalogJmxRegistry;
        var xml = '';
        list.forEach(function (item) {
            if (!item) return;
            if (R && typeof R.writeStep === 'function') {
                xml += R.writeStep(item, indent, helpers);
            } else if (global.JmxCatalogElement && typeof global.JmxCatalogElement.genXml === 'function') {
                xml += global.JmxCatalogElement.genXml(item, indent, helpers);
            }
        });
        return xml;
    }

    global.JmsCatalogMountJmx = {
        genMountItemsXml: genMountItemsXml
    };
})(typeof window !== 'undefined' ? window : this);
