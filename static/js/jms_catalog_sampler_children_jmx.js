/**
 * JMeter catalog · HTTP 取样器 hashTree 子元件 JMX 导出（隔离模块）
 */
(function (global) {
    'use strict';

    function genXml(step, childPad, escapeXml) {
        var list = step && step.catalog_hash_children;
        if (!list || !list.length) return '';
        var xml = '';
        list.forEach(function (item) {
            if (global.JmxCatalogElement && typeof global.JmxCatalogElement.genXml === 'function') {
                xml += global.JmxCatalogElement.genXml(item, childPad, { escapeXml: escapeXml });
            }
        });
        return xml;
    }

    function hasChildren(step) {
        return !!(step && Array.isArray(step.catalog_hash_children) && step.catalog_hash_children.length);
    }

    global.JmsCatalogSamplerChildrenJmx = {
        genXml: genXml,
        hasChildren: hasChildren
    };
})(window);
