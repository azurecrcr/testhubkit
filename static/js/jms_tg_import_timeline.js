/**
 * JMX 导入 · 线程组配置/步骤按 import_order 交错渲染（隔离模块）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsTgConfigCatalog;

    function hasContent(item) {
        if (Catalog && typeof Catalog.isPersistable === 'function') return Catalog.isPersistable(item);
        return Catalog && typeof Catalog.hasContent === 'function' ? Catalog.hasContent(item) : !!item;
    }

    function canUse(tg) {
        if (!tg) return false;
        var items = tg.config_items || [];
        var i;
        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].import_order != null) return true;
        }
        var steps = tg.steps || [];
        for (i = 0; i < steps.length; i++) {
            if (steps[i] && steps[i].import_order != null) return true;
        }
        return false;
    }

    function buildTopLevelOnlyEntries(tg) {
        var entries = [];
        (tg.config_items || []).forEach(function (item) {
            if (item && hasContent(item) && !item.parent_step_id) {
                entries.push({ kind: 'config', ref: item, order: item.import_order });
            }
        });
        (tg.steps || []).forEach(function (step) {
            if (step) {
                entries.push({ kind: 'step', ref: step, order: step.import_order });
            }
        });
        if (canUse(tg)) {
            entries = entries.filter(function (e) { return e.order != null; });
            entries.sort(function (a, b) { return a.order - b.order; });
        } else {
            var configs = entries.filter(function (e) { return e.kind === 'config'; });
            var steps = entries.filter(function (e) { return e.kind === 'step'; });
            entries = configs.concat(steps);
        }
        return entries;
    }

    function buildNestedConfigMap(tg) {
        var nestedByParent = {};
        (tg.config_items || []).forEach(function (item) {
            if (item && item.parent_step_id && hasContent(item)) {
                var pid = item.parent_step_id;
                if (!nestedByParent[pid]) nestedByParent[pid] = [];
                nestedByParent[pid].push({ kind: 'config', ref: item, order: item.import_order });
            }
        });
        Object.keys(nestedByParent).forEach(function (pid) {
            nestedByParent[pid].sort(function (a, b) {
                return (a.order != null ? a.order : 0) - (b.order != null ? b.order : 0);
            });
        });
        return nestedByParent;
    }

    function buildTopLevelEntries(tg) {
        var topLevel = buildTopLevelOnlyEntries(tg);
        var nestedByParent = buildNestedConfigMap(tg);
        var flat = [];
        topLevel.forEach(function (entry) {
            flat.push(entry);
            if (entry.kind === 'step' && entry.ref && entry.ref.id) {
                var nested = nestedByParent[entry.ref.id] || [];
                nested.forEach(function (n) { flat.push(n); });
            }
        });
        return flat;
    }

    function normalizeTgImportTimelineOrder(tg) {
        if (!tg) return;
        var entries = buildTopLevelOnlyEntries(tg);
        if (!entries.length) return;
        entries.forEach(function (entry, idx) {
            entry.ref.import_order = idx;
        });
    }

    function reorderTopLevel(tg, fromIndex, toIndex) {
        if (!tg || fromIndex === toIndex) return false;
        var entries = buildTopLevelOnlyEntries(tg);
        if (fromIndex < 0 || fromIndex >= entries.length) return false;
        toIndex = Math.max(0, Math.min(toIndex, entries.length - 1));
        if (fromIndex === toIndex) return true;
        var moved = entries.splice(fromIndex, 1)[0];
        entries.splice(toIndex, 0, moved);
        entries.forEach(function (entry, idx) {
            entry.ref.import_order = idx;
        });
        return true;
    }

    function render(planId, tg, selectedId, helpers) {
        var entries = buildTopLevelEntries(tg);

        var html = '';
        var indexRef = { n: 0 };
        var ConfigUi = global.JmsTgConfigUi;
        entries.forEach(function (entry) {
            if (entry.kind === 'config' && ConfigUi && typeof ConfigUi.renderConfigRow === 'function') {
                html += ConfigUi.renderConfigRow(planId, tg.id, entry.ref);
            } else if (entry.kind === 'step' && helpers && typeof helpers.renderSingleStep === 'function') {
                html += helpers.renderSingleStep(entry.ref, planId, tg.id, 0, indexRef, '', selectedId);
            }
        });
        return html;
    }

    global.JmsTgImportTimeline = {
        canUse: canUse,
        render: render,
        buildTopLevelEntries: buildTopLevelEntries,
        buildTopLevelOnlyEntries: buildTopLevelOnlyEntries,
        normalizeTgImportTimelineOrder: normalizeTgImportTimelineOrder,
        reorderTopLevel: reorderTopLevel
    };
}(typeof window !== 'undefined' ? window : this));
