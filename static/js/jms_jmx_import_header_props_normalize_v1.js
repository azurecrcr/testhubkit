/**
 * JMX 导入 · HeaderManager catalog_props.headers 格式归一化（隔离模块）
 * 解析器产出 object，编辑器需要 [{ key, value }] 数组。
 */
(function (global) {
    'use strict';

    function normalizeHeaderProps(props) {
        if (!props || typeof props !== 'object') return props;
        var out = Object.assign({}, props);
        if (out.headers == null) return out;
        var C = global.JmsTgConfigCatalog;
        if (C && typeof C.normalizeHeaders === 'function') {
            out.headers = C.normalizeHeaders(out.headers);
            return out;
        }
        if (Array.isArray(out.headers)) {
            out.headers = out.headers.map(function (r) {
                if (!r || typeof r !== 'object') return null;
                var k = String(r.key || r.name || '').trim();
                if (!k) return null;
                return { key: k, name: k, value: r.value == null ? '' : String(r.value) };
            }).filter(Boolean);
            return out;
        }
        if (typeof out.headers === 'object') {
            out.headers = Object.keys(out.headers).map(function (k) {
                return {
                    key: k,
                    name: k,
                    value: out.headers[k] == null ? '' : String(out.headers[k])
                };
            });
        } else {
            out.headers = [];
        }
        return out;
    }

    function normalizeConfigCatalogProps(props, cfgType) {
        if (!props || cfgType !== 'header_manager') return props;
        return normalizeHeaderProps(props);
    }

    function isHeaderManagerStep(step) {
        return !!(step && step.type === 'catalog_element' && step.alias === 'HeaderManager');
    }

    function normalizeCatalogElementStep(step) {
        if (!isHeaderManagerStep(step)) return step;
        if (!step.catalog_props || typeof step.catalog_props !== 'object') {
            step.catalog_props = { comments: '', headers: [] };
            return step;
        }
        step.catalog_props = normalizeHeaderProps(step.catalog_props);
        return step;
    }

    function normalizeHashChildren(list) {
        if (!Array.isArray(list)) return list;
        list.forEach(function (child) {
            if (!child) return;
            normalizeCatalogElementStep(child);
            if (Array.isArray(child.catalog_hash_children)) normalizeHashChildren(child.catalog_hash_children);
        });
        return list;
    }

    function normalizeSamplerHostStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (Array.isArray(step.catalog_hash_children)) normalizeHashChildren(step.catalog_hash_children);
        return step;
    }

    global.JmsJmxImportHeaderPropsNormalizeV1 = {
        normalizeHeaderProps: normalizeHeaderProps,
        normalizeConfigCatalogProps: normalizeConfigCatalogProps,
        normalizeCatalogElementStep: normalizeCatalogElementStep,
        normalizeHashChildren: normalizeHashChildren,
        normalizeSamplerHostStep: normalizeSamplerHostStep
    };
}(typeof window !== 'undefined' ? window : this));
