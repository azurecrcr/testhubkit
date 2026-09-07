/**
 * JMeter catalog · 取样器 hashTree 子元件（catalog_hash_children，隔离模块）
 */
(function (global) {
    'use strict';

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === String(stepId)) return s;
            if (Array.isArray(s.children)) {
                var n = findStepInList(s.children, stepId);
                if (n) return n;
            }
        }
        return null;
    }

    function isSamplerStep(step) {
        if (!step) return false;
        if (step.method && !step.type) return true;
        if (step.type === 'debug_sampler') return true;
        return step.type === 'catalog_element' && step.category === 'sampler';
    }

    function findPlan(model, planId) {
        return (model.test_plans || []).filter(function (p) { return p && p.id === planId; })[0];
    }

    function findTg(plan, tgId, model) {
        var tg = (plan.thread_groups || []).filter(function (t) { return t && t.id === tgId; })[0];
        if (tg) return tg;
        tg = (model.setup_thread_groups || []).filter(function (t) { return t && t.id === tgId; })[0];
        if (tg) return tg;
        return (model.post_thread_groups || []).filter(function (t) { return t && t.id === tgId; })[0];
    }

    function findSamplerStep(model, planId, tgId, stepId) {
        var plan = findPlan(model, planId);
        var tg = plan && findTg(plan, tgId, model);
        if (!tg || !stepId) return null;
        var step = findStepInList(tg.steps, stepId);
        return step && isSamplerStep(step) ? step : null;
    }

    function ensureChildren(step) {
        if (!step.catalog_hash_children) step.catalog_hash_children = [];
        return step.catalog_hash_children;
    }

    function findMountHostStep(model, planId, tgId, stepId) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.findMountHostStep === 'function') {
            return global.JmsMountHostResolver.findMountHostStep(model, planId, tgId, stepId);
        }
        return findSamplerStep(model, planId, tgId, stepId);
    }

    function appendUnderMountHost(vb, planId, tgId, hostStepId, stepData) {
        if (!vb || typeof vb.getModel !== 'function' || !stepData) return null;
        if (typeof vb.readModelFromDom === 'function') vb.readModelFromDom();
        var model = vb.getModel();
        var step = findMountHostStep(model, planId, tgId, hostStepId);
        if (!step) return null;
        var list = ensureChildren(step);
        var item = Object.assign({ id: stepData.id || ('cat_' + Math.random().toString(36).slice(2, 10)) }, stepData);
        if (item.container && !Array.isArray(item.children)) item.children = [];
        list.push(item);
        if (typeof vb.notifyUserEdit === 'function') vb.notifyUserEdit();
        return item;
    }

    function appendUnderSampler(vb, planId, tgId, samplerStepId, stepData) {
        return appendUnderMountHost(vb, planId, tgId, samplerStepId, stepData);
    }

    function catalogChildToYaml(item) {
        if (!item || item.type !== 'catalog_element') return null;
        var out = {
            type: 'catalog_element',
            name: item.name || item.alias,
            alias: item.alias,
            enabled: item.enabled !== false
        };
        if (item.testclass) out.testclass = item.testclass;
        if (item.guiclass) out.guiclass = item.guiclass;
        if (item.jmeter_class) out.jmeter_class = item.jmeter_class;
        if (item.category) out.category = item.category;
        if (item.label_zh) out.label_zh = item.label_zh;
        if (item.container) out.container = true;
        if (item.jmx_fragment) out.jmx_fragment = item.jmx_fragment;
        if (item.catalog_props && typeof item.catalog_props === 'object') {
            var props = Object.assign({}, item.catalog_props);
            var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
            if (HN && item.alias === 'HeaderManager' && typeof HN.normalizeHeaderProps === 'function') {
                props = HN.normalizeHeaderProps(props);
            }
            var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
            if (JA && item.alias === 'JSONPathAssertion' && typeof JA.normalizeJsonAssertProps === 'function') {
                props = JA.normalizeJsonAssertProps(props);
            }
            out.catalog_props = props;
        }
        if (Array.isArray(item.children) && item.children.length) {
            out.children = item.children.map(catalogChildToYaml).filter(Boolean);
        }
        return out;
    }

    function parseCatalogChildFromYaml(raw) {
        if (!raw || raw.type !== 'catalog_element') return null;
        var item = Object.assign({ id: 'cat_' + Math.random().toString(36).slice(2, 10) }, raw, {
            type: 'catalog_element',
            children: Array.isArray(raw.children) ? raw.children.map(parseCatalogChildFromYaml).filter(Boolean) : undefined
        });
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && item.alias === 'HeaderManager' && typeof HN.normalizeCatalogElementStep === 'function') {
            HN.normalizeCatalogElementStep(item);
        }
        var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA && item.alias === 'JSONPathAssertion' && typeof JA.normalizeCatalogElementStep === 'function') {
            JA.normalizeCatalogElementStep(item);
        }
        return item;
    }

    function renderListHtml(step) {
        var list = step && step.catalog_hash_children;
        if (!list || !list.length) return '';
        var rows = list.map(function (item, i) {
            var label = item.label_zh || item.name || item.alias || '元件';
            var cat = item.category || '';
            return '<div class="jms-http-context__catalog-child-row" data-catalog-child-index="' + i + '">' +
                '<span class="jms-aux-type">' + cat + '</span>' +
                '<span class="jms-http-context__catalog-child-name">' + label + '</span></div>';
        }).join('');
        return '<div class="jms-http-context__catalog-children">' +
            '<div class="jms-http-context__catalog-children-head"><span>Catalog 子元件</span>' +
            '<span class="jms-http-context__catalog-child-count">' + list.length + ' 个</span></div>' +
            rows + '</div>';
    }

    function bindRenderHook() {
        /* v2fix6: catalog 子元件改由 HTTP mount 树渲染，不再重复注入详情面板 */
    }

    global.JmsCatalogSamplerChildren = {
        findSamplerStep: findSamplerStep,
        findMountHostStep: findMountHostStep,
        appendUnderMountHost: appendUnderMountHost,
        appendUnderSampler: appendUnderSampler,
        catalogChildToYaml: catalogChildToYaml,
        parseCatalogChildFromYaml: parseCatalogChildFromYaml,
        renderListHtml: renderListHtml,
        bindRenderHook: bindRenderHook
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindRenderHook);
    } else {
        setTimeout(bindRenderHook, 120);
    }
    global.addEventListener('pageshow', bindRenderHook);
})(window);
