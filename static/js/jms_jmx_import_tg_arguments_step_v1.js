/**
 * JMX 导入 · 线程组级 Arguments（计划变量）保留为 catalog 步骤并写入 import_order
 * 隔离模块：不改动计划级 Arguments / pushPlanArgumentsCatalogItem。
 */
(function (global) {
    'use strict';

    function uid(prefix) {
        return (prefix || 'arg_') + Math.random().toString(36).slice(2, 10);
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var n = el.querySelector('stringProp[name="' + name + '"]');
        return n ? String(n.textContent || '') : '';
    }

    function parseArgumentsVars(node) {
        var vars = {};
        if (!node) return vars;
        var props = node.querySelectorAll('elementProp[elementType="Argument"]');
        for (var i = 0; i < props.length; i++) {
            var name = getStringProp(props[i], 'Argument.name');
            if (name) vars[name] = getStringProp(props[i], 'Argument.value');
        }
        return vars;
    }

    function objToKvList(obj) {
        var out = [];
        Object.keys(obj || {}).forEach(function (k) {
            out.push({ key: k, value: obj[k] == null ? '' : String(obj[k]) });
        });
        return out;
    }

    function isEnabled(node) {
        if (!node) return true;
        var en = node.getAttribute('enabled');
        return en == null || en === '' || en === 'true';
    }

    function buildStep(node) {
        if (!node) return null;
        var tc = node.getAttribute('testclass') || node.tagName || '';
        if (tc !== 'Arguments') return null;
        var gui = node.getAttribute('guiclass') || '';
        // 跳过 HTTP 请求体内的 Arguments / HTTPArgumentsPanel
        if (gui === 'HTTPArgumentsPanel') return null;
        var vars = parseArgumentsVars(node);
        var testname = (node.getAttribute('testname') || '').trim() || '计划变量';
        return {
            id: uid('arg_'),
            type: 'catalog_element',
            name: testname,
            label_zh: testname,
            enabled: isEnabled(node),
            alias: 'Arguments',
            testclass: 'Arguments',
            guiclass: gui || 'ArgumentsPanel',
            category: 'config',
            container: false,
            scope: 'unified',
            catalog_props: {
                comments: getStringProp(node, 'TestPlan.comments') || '',
                arguments: objToKvList(vars)
            },
            jmx_fragment: '',
            _import_args_map: vars
        };
    }

    function mergeIntoTgVariables(tg, step) {
        if (!tg || !step) return;
        var map = step._import_args_map || {};
        if (!tg.variables || typeof tg.variables !== 'object' || Array.isArray(tg.variables)) {
            tg.variables = {};
        }
        Object.keys(map).forEach(function (k) {
            if (tg.variables[k] === undefined) tg.variables[k] = map[k];
        });
        if (!tg._variables_block) tg._variables_block = { enabled: true };
        // 变量已以 Arguments 步骤展示；禁用单独的 tg_variables 行，避免双份与错序
        tg._variables_block.enabled = false;
        tg._variables_block.import_order = step.import_order;
        tg._args_catalog_imported = true;
        delete step._import_args_map;
    }

    function stepsHaveArgumentsCatalog(steps) {
        var hit = false;
        (steps || []).forEach(function (s) {
            if (hit || !s) return;
            if (s.type === 'catalog_element' && s.alias === 'Arguments') hit = true;
            if (Array.isArray(s.children) && stepsHaveArgumentsCatalog(s.children)) hit = true;
            if (Array.isArray(s.catalog_hash_children) && stepsHaveArgumentsCatalog(s.catalog_hash_children)) hit = true;
        });
        return hit;
    }

    function shouldSkipTgLocalVariablesExport(plan) {
        if (!plan) return false;
        if (plan._args_catalog_imported) return true;
        return stepsHaveArgumentsCatalog(plan.steps);
    }

    global.JmsJmxImportTgArgumentsStepV1 = {
        buildStep: buildStep,
        mergeIntoTgVariables: mergeIntoTgVariables,
        stepsHaveArgumentsCatalog: stepsHaveArgumentsCatalog,
        shouldSkipTgLocalVariablesExport: shouldSkipTgLocalVariablesExport
    };
})(typeof window !== 'undefined' ? window : this);
