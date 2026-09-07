/**
 * catalog HTTP 取样器 · catalog_props 完整 JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s);
    }

    function injectHashChildren(xml, indent, hashChildren, helpers) {
        if (!hashChildren || !hashChildren.length) return xml;
        var M = global.JmsCatalogMountJmx;
        if (!M || typeof M.genMountItemsXml !== 'function') return xml;
        var mountXml = M.genMountItemsXml(hashChildren, indent + '  ', helpers);
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

    function isHttpAlias(alias) {
        return alias === 'HTTPSamplerProxy' || alias === 'HTTPSampler' || alias === 'HTTPSampler2';
    }

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element' || !isHttpAlias(step.alias)) return '';
        var P = global.JmsCatalogJmxPrepare;
        var flat = P && typeof P.flattenHttpCatalogStep === 'function'
            ? P.flattenHttpCatalogStep(step)
            : (step.catalog_props || {});
        if (!flat.method) return '';
        if (!helpers || typeof helpers.genSingleStepXml !== 'function') return '';
        var EX = global.JmsCatalogExtractExportV1;
        var flatForGen = EX && typeof EX.prepareFlatForGenSingleHttp === 'function'
            ? EX.prepareFlatForGenSingleHttp(flat)
            : flat;
        var xml = helpers.genSingleStepXml(flatForGen, 0, indent, {});
        if (EX && typeof EX.injectExtractorsIntoSamplerXml === 'function') {
            xml = EX.injectExtractorsIntoSamplerXml(xml, flat, indent, helpers);
        }
        var hashKids = step.catalog_hash_children;
        if (hashKids && hashKids.length) {
            var ORD = global.JmsCatalogSamplerChildrenOrderV1;
            if (ORD && typeof ORD.injectOrderedHashChildren === 'function') {
                xml = ORD.injectOrderedHashChildren(xml, indent, hashKids, helpers);
            } else {
                xml = injectHashChildren(xml, indent, hashKids, helpers);
            }
        }
        return xml;
    }

    global.JmsCatalogHttpSamplerJmx = {
        isHttpAlias: isHttpAlias,
        genXml: genXml
    };
})(typeof window !== 'undefined' ? window : this);
