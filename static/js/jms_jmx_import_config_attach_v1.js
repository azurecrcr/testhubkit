/**
 * JMX 导入 · 将带 parent_step_id 的 config_items 挂回父步骤（隔离模块）
 */
(function (global) {
    'use strict';

    function findStepById(steps, id) {
        var found = null;
        function walk(list) {
            (list || []).forEach(function (s) {
                if (found || !s) return;
                if (s.id === id) {
                    found = s;
                    return;
                }
                walk(s.children);
                walk(s.catalog_hash_children);
            });
        }
        walk(steps);
        return found;
    }

    function isHttpSamplerStep(step) {
        if (!step) return false;
        if (step.type === 'catalog_element' && step.alias === 'HTTPSamplerProxy') return true;
        if (!step.type && (step.method || step.path != null || step.body != null)) return true;
        return false;
    }

    function attachNestedConfigItems(tg, configItemToCatalog) {
        if (!tg || !Array.isArray(tg.config_items) || !tg.config_items.length) return;
        if (typeof configItemToCatalog !== 'function') return;

        var nested = [];
        var top = [];
        tg.config_items.forEach(function (item) {
            if (!item) return;
            if (item.parent_step_id) nested.push(item);
            else top.push(item);
        });
        if (!nested.length) {
            tg.config_items = top;
            return;
        }

        nested.sort(function (a, b) {
            return (a.import_order != null ? a.import_order : 0) - (b.import_order != null ? b.import_order : 0);
        });

        nested.forEach(function (item) {
            var parent = findStepById(tg.steps, item.parent_step_id);
            if (!parent) {
                top.push(item);
                return;
            }
            var cat = configItemToCatalog(item);
            if (!cat) return;
            if (item.import_order != null) cat.import_order = item.import_order;
            function insertByImportOrder(list, cat, order) {
                if (!Array.isArray(list)) list = [];
                if (order == null) {
                    list.push(cat);
                    return list;
                }
                var idx = list.length;
                for (var i = 0; i < list.length; i++) {
                    var o = list[i] && list[i].import_order;
                    if (o != null && order < o) { idx = i; break; }
                }
                list.splice(idx, 0, cat);
                return list;
            }
            if (isHttpSamplerStep(parent)) {
                parent.catalog_hash_children = insertByImportOrder(parent.catalog_hash_children, cat, item.import_order);
            } else {
                parent.children = insertByImportOrder(parent.children, cat, item.import_order);
            }
        });

        tg.config_items = top;
    }

    global.JmsJmxImportConfigAttachV1 = {
        attachNestedConfigItems: attachNestedConfigItems,
        findStepById: findStepById,
        isHttpSamplerStep: isHttpSamplerStep
    };
}(typeof window !== 'undefined' ? window : this));
