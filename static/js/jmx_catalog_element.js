/**
 * JMeter catalog_element · JMX 序列化（隔离模块，不修改 genJmx 核心逻辑）
 */
(function (global) {
    'use strict';

    function escapeXml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function applyTestName(fragment, name) {
        var n = escapeXml(name || 'Catalog Element');
        return String(fragment || '').replace(/testname="[^"]*"/, 'testname="' + n + '"');
    }

    function shouldSkipLegacyFallback(step) {
        if (!step || !step.alias) return false;
        var maps = [
            global.JmsCatalogHttpSamplerJmx,
            global.JmsCatalogControllerJmx,
            global.JmsCatalogConfigJmx,
            global.JmsCatalogAuxJmx
        ];
        var i, mod;
        for (i = 0; i < maps.length; i += 1) {
            mod = maps[i];
            if (mod && mod.MAP && mod.MAP[step.alias]) return true;
        }
        return false;
    }

    function legacyFallbackXml(step, indent, helpers) {
        var esc = (helpers && helpers.escapeXml) || escapeXml;
        var en = step.enabled === false ? 'false' : 'true';
        var fragment = step.jmx_fragment || '';
        if (!fragment && step.alias) {
            fragment = '<' + step.alias + ' guiclass="' + esc(step.guiclass || step.alias + 'Gui') +
                '" testclass="' + esc(step.testclass || step.alias) +
                '" testname="' + esc(step.name || step.alias) + '" enabled="' + en + '"></' + step.alias + '>';
        }
        fragment = applyTestName(fragment, step.name || step.label_zh || step.alias);
        fragment = fragment.replace(/enabled="(true|false)"/, 'enabled="' + en + '"');
        var lines = fragment.split('\n');
        var xml = '';
        lines.forEach(function (line) {
            xml += indent + line + '\n';
        });
        if (step.container) {
            xml += indent + '<hashTree>\n';
            var pad = indent + '  ';
            var M = global.JmsCatalogMountJmx;
            if (M && typeof M.genMountItemsXml === 'function' && step.catalog_hash_children && step.catalog_hash_children.length) {
                xml += M.genMountItemsXml(step.catalog_hash_children, pad, helpers || {});
            }
            if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.genStepsTreeXml === 'function') {
                xml += global.JmxScenarioAdvanced.genStepsTreeXml(step.children || [], pad, helpers || {});
            }
            xml += indent + '</hashTree>\n';
        } else {
            xml += indent + '<hashTree/>\n';
        }
        return xml;
    }

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element') return '';
        var R = global.JmsCatalogJmxRegistry;
        if (R && typeof R.writeStep === 'function') {
            var routed = R.writeStep(step, indent, helpers || {});
            if (routed) return routed;
        }
        if (global.JmsPlanCatalogJmxProps && typeof global.JmsPlanCatalogJmxProps.tryGenFromProps === 'function') {
            var propsXml = global.JmsPlanCatalogJmxProps.tryGenFromProps(step, indent);
            if (propsXml) return propsXml;
        }
        if (shouldSkipLegacyFallback(step)) return '';
        return legacyFallbackXml(step, indent, helpers);
    }

    function isCatalogStep(st) {
        return !!(st && st.type === 'catalog_element');
    }

    global.JmxCatalogElement = {
        genXml: genXml,
        isCatalogStep: isCatalogStep,
        escapeXml: escapeXml,
        legacyFallbackXml: legacyFallbackXml
    };
})(window);
