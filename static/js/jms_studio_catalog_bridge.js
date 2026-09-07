/**
 * JMeter 压测 · catalog 组件添加桥接（隔离模块，不修改 appendAuxStep）
 */
(function (global) {
    'use strict';

    function uid() {
        return 'cat_' + Math.random().toString(36).slice(2, 10);
    }

    function toast(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error', placement: 'bottom' });
        }
    }

    function getTemplates(state) {
        return (state && state.templates) || {};
    }

    var CONTAINER_ALIASES = {
        IfController: 1,
        RandomController: 1,
        GenericController: 1,
        SimpleController: 1,
        TransactionController: 1,
        LoopController: 1
    };

    function isContainerComp(comp) {
        if (!comp) return false;
        return !!(comp.container || comp.category === 'controller' || CONTAINER_ALIASES[comp.alias]);
    }

    function buildCatalogStep(comp, templates) {
        var tpl = templates[comp.alias] || {};
        var name = comp.label_zh || comp.alias;
        var seq = Math.floor(Math.random() * 900) + 100;
        var container = isContainerComp(comp);
        return {
            id: uid(),
            type: 'catalog_element',
            name: name + ' ' + seq,
            enabled: true,
            alias: comp.alias,
            testclass: tpl.testclass || comp.alias,
            guiclass: tpl.guiclass || (comp.alias + 'Gui'),
            jmeter_class: comp.class || tpl.class || '',
            category: comp.category || 'other',
            label_zh: comp.label_zh || comp.alias,
            container: container,
            scope: comp.scope || 'core',
            jmx_fragment: tpl.jmx_fragment || '',
            children: container ? [] : undefined
        };
    }

    function addConfigItem(vb, planId, tgId, configType, label) {
        if (!global.JmsTgConfigCatalog) return false;
        var model = vb.getModel();
        var sid = global.JmsCatalogContextAppend && global.JmsCatalogContextAppend.sid
            ? global.JmsCatalogContextAppend.sid
            : function (v) { return v == null ? '' : String(v); };
        var plan = (model.test_plans || []).filter(function (p) { return p && sid(p.id) === sid(planId); })[0];
        if (!plan) return false;
        var tg = [].concat(plan.thread_groups || [], model.setup_thread_groups || [], model.post_thread_groups || [])
            .filter(function (t) { return t && sid(t.id) === sid(tgId); })[0];
        if (!tg) return false;
        if (!Array.isArray(tg.config_items)) tg.config_items = [];
        var item = global.JmsTgConfigCatalog.normalizeItem({
            id: uid(),
            type: configType,
            name: label || global.JmsTgConfigCatalog.LABELS[configType] || configType,
            data: global.JmsTgConfigCatalog.defaultItemData(configType)
        });
        if (!item) return false;
        tg.config_items.push(item);
        vb.notifyUserEdit();
        vb.syncYamlFromModel();
        if (typeof vb.triggerRender === 'function') vb.triggerRender();
        return true;
    }

    function addViaMapped(vb, planId, tgId, parentStepId, mapped, comp) {
        if (mapped.kind === 'http') {
            if (typeof vb.addBlankHttpStepAt === 'function') {
                vb.addBlankHttpStepAt(planId, tgId, parentStepId || null);
                return true;
            }
            if (typeof vb.triggerTgAddHttpStep === 'function') {
                vb.triggerTgAddHttpStep(planId, tgId);
                return true;
            }
            return false;
        }
        if (mapped.kind === 'aux') {
            if (parentStepId && typeof vb.appendAuxStepToParent === 'function') {
                vb.appendAuxStepToParent(planId, tgId, parentStepId, mapped.auxType);
                return true;
            }
            if (typeof vb.appendAuxStep === 'function') {
                vb.appendAuxStep(planId, tgId, mapped.auxType);
                return true;
            }
            return false;
        }
        if (mapped.kind === 'config') {
            return addConfigItem(vb, planId, tgId, mapped.configType, comp.label_zh);
        }
        return false;
    }

    function appendCatalogElement(vb, comp, insertCtx, catalogState) {
        var Editor = global.JmsCatalogElementEditorUi;
        if (Editor && typeof Editor.openForCreate === 'function') {
            Editor.openForCreate(comp, insertCtx, catalogState || {});
            return { ok: true, mode: 'pending_create', pending: true };
        }
        return { ok: false, error: 'no_editor' };
    }

    function addCatalogComponent(comp, insertCtx, catalogState) {
        var vb = global.JmsVisualBuilder;
        if (!vb) {
            toast('可视化编辑器未就绪', false);
            return { ok: false, error: 'no_vb' };
        }
        if (!comp || !comp.alias) {
            toast('无效组件', false);
            return { ok: false, error: 'no_comp' };
        }
        insertCtx = insertCtx || (global.JmsCatalogPlacement && global.JmsCatalogPlacement.resolveInsertContext(vb));
        if (!insertCtx || !insertCtx.planId) {
            toast('请先选择测试计划', false);
            return { ok: false, error: 'no_plan' };
        }
        if (insertCtx.context !== 'test_plan' && !insertCtx.tgId) {
            toast('请先选择或创建线程组', false);
            return { ok: false, error: 'no_tg' };
        }

        var placement = (catalogState && catalogState.placement) || catalogState || {};
        if (global.JmsCatalogPlacement && !global.JmsCatalogPlacement.componentAllowed(comp, insertCtx.context, placement.hierarchy || placement)) {
            toast('当前位置不可添加该组件', false);
            return { ok: false, error: 'not_allowed' };
        }

        var res = appendCatalogElement(vb, comp, insertCtx, catalogState || {});
        if (res.ok) {
            if (res.pending || res.mode === 'pending_create') return res;
            return res;
        }
        if (res.error === 'no_sampler') {
            toast('未找到取样器，无法添加该元件', false);
        } else if (res.error === 'parent_not_found') {
            toast('添加失败：未找到目标逻辑控制器', false);
        } else if (res.error === 'parent_not_container') {
            toast('添加失败：目标节点不是可挂载容器', false);
        } else if (res.error === 'no_tg') {
            toast('添加失败：未找到线程组', false);
        } else if (res.error === 'append_failed') {
            toast('添加失败：无法写入步骤树', false);
        } else if (res.error === 'no_api') {
            toast('catalog 添加接口未加载', false);
        } else {
            toast('添加失败：' + (comp.label_zh || comp.alias), false);
        }
        return res;
    }

    global.JmsStudioCatalogBridge = {
        addCatalogComponent: addCatalogComponent,
        buildCatalogStep: buildCatalogStep,
        appendCatalogElement: appendCatalogElement
    };
})(window);
