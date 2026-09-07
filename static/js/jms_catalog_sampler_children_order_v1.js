/**
 * catalog hashTree 子节点有序写出（隔离模块，替代无序 injectHashChildren）
 */
(function (global) {
    'use strict';

    var ORDER = [
        'BeanShellPreProcessor', 'JSR223PreProcessor', 'UserParameters',
        'HeaderManager', 'ConfigTestElement', 'AuthManager', 'CookieManager', 'CacheManager',
        'JSONPostProcessor', 'RegexExtractor', 'XPathExtractor',
        'JSR223PostProcessor', 'BeanShellPostProcessor', 'JDBCPostProcessor',
        'ResponseAssertion', 'JSONPathAssertion', 'SizeAssertion', 'MD5HexAssertion', 'JSR223Assertion',
        'ConstantTimer', 'DebugSampler', 'ViewResultsFullVisualizer', 'StatVisualizer', 'ResultCollector'
    ];

    function orderIndex(alias) {
        var i = ORDER.indexOf(alias);
        return i >= 0 ? i : 999;
    }

    function sortHashChildren(list) {
        return (list || []).slice().sort(function (a, b) {
            return orderIndex(a && a.alias) - orderIndex(b && b.alias);
        });
    }

    function injectOrderedHashChildren(xml, indent, hashChildren, helpers) {
        if (!hashChildren || !hashChildren.length) return xml;
        var sorted = sortHashChildren(hashChildren);
        var M = global.JmsCatalogMountJmx;
        if (!M || typeof M.genMountItemsXml !== 'function') return xml;
        var mountXml = M.genMountItemsXml(sorted, indent + '  ', helpers);
        if (!mountXml) return xml;
        var emptyTag = indent + '<hashTree/>\n';
        if (xml.indexOf(emptyTag) >= 0) {
            return xml.replace(emptyTag, indent + '<hashTree>\n' + mountXml + indent + '</hashTree>\n');
        }
        var close = indent + '</hashTree>\n';
        var idx = xml.lastIndexOf(close);
        if (idx >= 0) {
            return xml.slice(0, idx) + mountXml + xml.slice(idx);
        }
        return xml + mountXml;
    }

    global.JmsCatalogSamplerChildrenOrderV1 = {
        ORDER: ORDER,
        sortHashChildren: sortHashChildren,
        injectOrderedHashChildren: injectOrderedHashChildren
    };
})(typeof window !== 'undefined' ? window : this);
