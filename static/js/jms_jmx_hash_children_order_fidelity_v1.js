/**
 * JMX 导入保真：hashTree 子节点保持原顺序（隔离模块）
 * 默认 JmsCatalogSamplerChildrenOrderV1 会按固定 ORDER 重排，
 * 导致导入未改再导出时 HeaderManager / 断言 / 预处理器位置与源不一致。
 * 仅在保真会话禁用排序；新建/非导入场景仍走原 ORDER 逻辑。
 */
(function (global) {
    'use strict';

    function fidelityActive() {
        return !!global.__jmxImportFidelityActive ||
            !!(global.__jmxLastImportedXml && String(global.__jmxLastImportedXml).indexOf('jmeterTestPlan') >= 0);
    }

    /** 新方法：保真时按导入顺序写出，否则沿用原排序 */
    function sortHashChildrenFidelityAware(list) {
        var ORD = global.JmsCatalogSamplerChildrenOrderV1;
        if (!list || !list.length) return list || [];
        if (fidelityActive()) {
            return list.slice();
        }
        if (ORD && typeof ORD.sortHashChildren === 'function' && !ORD.__fidelityOrderWrappedV1) {
            return ORD.sortHashChildren(list);
        }
        return list.slice();
    }

    function patchOrderModule() {
        var ORD = global.JmsCatalogSamplerChildrenOrderV1;
        if (!ORD || typeof ORD.injectOrderedHashChildren !== 'function') return false;
        if (ORD.__fidelityOrderWrappedV1) return true;

        var origSort = ORD.sortHashChildren;
        var origInject = ORD.injectOrderedHashChildren;

        ORD.sortHashChildren = function (list) {
            if (fidelityActive()) return (list || []).slice();
            return origSort.call(ORD, list);
        };

        ORD.injectOrderedHashChildren = function (xml, indent, hashChildren, helpers) {
            if (!fidelityActive()) {
                return origInject.call(ORD, xml, indent, hashChildren, helpers);
            }
            // 新路径：不排序，直接按原数组顺序挂载
            if (!hashChildren || !hashChildren.length) return xml;
            var M = global.JmsCatalogMountJmx;
            if (!M || typeof M.genMountItemsXml !== 'function') return xml;
            var mountXml = M.genMountItemsXml(hashChildren.slice(), indent + '  ', helpers);
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
        };

        ORD.__fidelityOrderWrappedV1 = true;
        return true;
    }

    function install() {
        patchOrderModule();
    }

    function boot() {
        install();
        var n = 0;
        var t = setInterval(function () {
            n += 1;
            install();
            if (n > 50) clearInterval(t);
        }, 100);
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    global.JmsJmxHashChildrenOrderFidelityV1 = {
        install: install,
        fidelityActive: fidelityActive,
        sortHashChildrenFidelityAware: sortHashChildrenFidelityAware
    };
})(typeof window !== 'undefined' ? window : this);
