/**
 * catalog 步骤 YAML 序列化补充（catalog_hash_children）
 */
(function (global) {
    'use strict';

    function catalogElementToYaml(s) {
        if (!s || s.type !== 'catalog_element') return null;
        var o = {
            type: 'catalog_element',
            name: s.name || s.label_zh || s.alias,
            enabled: s.enabled !== false,
            alias: s.alias,
            testclass: s.testclass || s.alias,
            guiclass: s.guiclass || '',
            jmeter_class: s.jmeter_class || '',
            category: s.category || 'other',
            label_zh: s.label_zh || s.alias,
            container: !!s.container,
            scope: s.scope || 'core',
            jmx_fragment: s.jmx_fragment || ''
        };
        if (s.catalog_props && typeof s.catalog_props === 'object') o.catalog_props = s.catalog_props;
        if (s.container && Array.isArray(s.children)) {
            o.children = catalogHashChildrenToYaml(s.children);
        }
        if (s.import_order != null) o.import_order = s.import_order;
        return o;
    }

    function catalogHashChildrenToYaml(list) {
        if (!Array.isArray(list)) return [];
        if (global.JmsCatalogSamplerChildren && typeof global.JmsCatalogSamplerChildren.catalogChildToYaml === 'function') {
            return list.map(global.JmsCatalogSamplerChildren.catalogChildToYaml).filter(Boolean);
        }
        return list.map(catalogElementToYaml).filter(Boolean);
    }

    function enrichCatalogStepYaml(catYaml, step) {
        if (!catYaml || !step || step.type !== 'catalog_element') return catYaml;
        if (Array.isArray(step.catalog_hash_children) && step.catalog_hash_children.length) {
            catYaml.catalog_hash_children = catalogHashChildrenToYaml(step.catalog_hash_children);
        }
        return catYaml;
    }

    global.JmsCatalogStepsYaml = {
        enrichCatalogStepYaml: enrichCatalogStepYaml,
        catalogHashChildrenToYaml: catalogHashChildrenToYaml
    };
})(typeof window !== 'undefined' ? window : this);
