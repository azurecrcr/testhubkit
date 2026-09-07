/**
 * 线程组详情 · 断言/配置/步骤统一时间线（隔离模块，不影响 If 内步骤拖动）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsTgConfigCatalog;
    var ImportTimeline = global.JmsTgImportTimeline;

    function listenerTimeline() {
        return global.JmsTgListenerTimeline;
    }


    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function tgVariablesSummary(tg) {
        var rows = Array.isArray(tg && tg.variables) ? tg.variables : [];
        var parts = [];
        rows.forEach(function (row) {
            var k = row && String(row.key || '').trim();
            if (!k) return;
            parts.push(k + '=' + (row.value == null ? '' : String(row.value)));
        });
        return parts.join(', ');
    }

    function hasTgVariables(tg) {
        return !!tgVariablesSummary(tg);
    }

    function hasTgProcessors(tg) {
        return (tg.processors || []).some(function (p) { return p && p.type && !p._deleted; });
    }

    function hasProcessorEntry(entries, proc) {
        var i;
        for (i = 0; i < entries.length; i++) {
            if (entries[i].kind === 'processor' && entries[i].ref === proc) return true;
        }
        return false;
    }

    function ensureVariablesBlock(tg) {
        if (!tg._variables_block) tg._variables_block = { enabled: true };
        return tg._variables_block;
    }

    function isVariablesBlockActive(tg) {
        var block = tg && tg._variables_block;
        if (!block) return true;
        return block.enabled !== false;
    }

    function renderAuxDragHandle(planId, tgId, attrs) {
        var extra = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                extra += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-parent-step-id=""' + extra + '>' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function renderProcessorDragHandle(planId, tgId, procIndex) {
        return renderAuxDragHandle(planId, tgId, { 'tg-proc-index': String(procIndex) });
    }

    function collectTgAuxEntries(tg, entries) {
        if (hasTgVariables(tg)) {
            var vblock = ensureVariablesBlock(tg);
            entries.push({ kind: 'tg_variables', ref: tg, vblock: vblock, order: getOrder(vblock, 'tg_variables', 0, tg) });
        }
        (tg.processors || []).forEach(function (proc, i) {
            if (!proc || !proc.type || proc._deleted || hasProcessorEntry(entries, proc)) return;
            entries.push({ kind: 'processor', ref: proc, procIndex: i, order: getOrder(proc, 'processor', i, tg) });
        });
    }

    function renderProcessorTreeRow(planId, tgId, proc, procIndex) {
        var disabled = proc.enabled === false ? ' is-disabled' : '';
        var typeLabel = proc.type === 'beanshell_post' ? 'BeanShell PP' : (proc.type || 'PostProcessor');
        var editBtn = '<button type="button" class="jms-btn-ghost jms-btn-edit-tg-processor" role="menuitem" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-proc-index="' + procIndex + '">编辑</button>';
        var delBtn = '<button type="button" class="jms-btn-ghost jms-btn-del-tg-processor" role="menuitem" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-proc-index="' + procIndex + '">删除</button>';
        var actions = '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="后置处理器操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' + editBtn + delBtn + '</div></div>';
        var P = global.JmsTgPostprocEnableUi;
        if (P && typeof P.renderTgProcessorToggle === 'function') {
            var toggle = P.renderTgProcessorToggle(planId, tgId, procIndex, proc.enabled);
            actions = typeof P.composeCardToolbar === 'function' ? P.composeCardToolbar(toggle, actions) : actions;
        }
        return '<div class="jms-tree-node jms-tree-node--tg-processor" data-depth="0" style="--jms-tree-depth:0;" data-proc-index="' + procIndex + '">' +
            renderProcessorDragHandle(planId, tgId, procIndex) +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--beanshell' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-proc-index="' + procIndex + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">PP</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">' + esc(typeLabel) + '</span>' +
            '<span class="jms-aux-name" title="' + esc(proc.name || '') + '">' + esc(proc.name || ('处理器 ' + (procIndex + 1))) + '</span>' +
            '</div>' + actions + '</div></div></div>';
    }

    function renderVariablesTreeRow(planId, tg) {
        var tgId = tg.id;
        var summary = tgVariablesSummary(tg);
        var disabled = isVariablesBlockActive(tg) ? '' : ' is-disabled';
        var V = global.JmsTgVariablesTimelineUi;
        var drag = V && typeof V.renderDragHandle === 'function'
            ? V.renderDragHandle(planId, tgId)
            : renderAuxDragHandle(planId, tgId, { 'tg-aux-kind': 'tg-variables' });
        var actions = '';
        if (V && typeof V.renderRowActions === 'function') {
            actions = V.renderRowActions(planId, tgId);
            if (typeof V.composeRowToolbar === 'function') {
                actions = V.composeRowToolbar(planId, tgId, isVariablesBlockActive(tg), actions);
            }
        }
        return '<div class="jms-tree-node jms-tree-node--tg-variables" data-depth="0" style="--jms-tree-depth:0;" data-tg-aux-kind="tg-variables">' +
            drag +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--tg-config jms-aux-card--tg-config-mgr' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">V</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">用户定义的变量</span>' +
            '<span class="jms-aux-name" title="' + esc(summary) + '">' + esc(summary) + '</span>' +
            '</div>' + actions + '</div></div></div>';
    }

    function hasContent(item) {
        if (Catalog && typeof Catalog.isPersistable === 'function') return Catalog.isPersistable(item);
        return Catalog && typeof Catalog.hasContent === 'function' ? Catalog.hasContent(item) : !!item;
    }

    function getAssertions(tg) {
        if (!tg || !Array.isArray(tg.assertions)) return [];
        return tg.assertions.filter(function (a) {
            return a && typeof a === 'object' && a.type;
        });
    }

    function getAssertIndex(tg, ref) {
        var list = getAssertions(tg);
        for (var i = 0; i < list.length; i++) {
            if (list[i] === ref) return i;
        }
        return 0;
    }

    function hasAnyExplicitOrder(tg) {
        if (!tg) return false;
        var i;
        var assertions = getAssertions(tg);
        for (i = 0; i < assertions.length; i++) {
            if (assertions[i] && assertions[i].timeline_order != null) return true;
        }
        var items = tg.config_items || [];
        for (i = 0; i < items.length; i++) {
            if (items[i] && (items[i].timeline_order != null || items[i].import_order != null)) return true;
        }
        var steps = tg.steps || [];
        for (i = 0; i < steps.length; i++) {
            if (steps[i] && (steps[i].timeline_order != null || steps[i].import_order != null)) return true;
        }
        var LT0 = listenerTimeline();
        if (LT0 && typeof LT0.scanTimelineOrder === 'function') {
            var found = false;
            LT0.scanTimelineOrder(tg, function (ref) {
                if (ref && (ref.timeline_order != null || ref.import_order != null)) found = true;
            });
            if (found) return true;
        }
        if (hasTgVariables(tg) && tg._variables_block) {
            if (tg._variables_block.timeline_order != null || tg._variables_block.import_order != null) return true;
        }
        var procsExp = tg.processors || [];
        for (i = 0; i < procsExp.length; i++) {
            if (procsExp[i] && (procsExp[i].timeline_order != null || procsExp[i].import_order != null)) return true;
        }
        return false;
    }

    function getOrder(ref, kind, fallbackIdx, tg) {
        if (!ref) return fallbackIdx;
        if (ref.timeline_order != null) return ref.timeline_order;
        if (kind !== 'assert' && ref.import_order != null) return ref.import_order;
        if (hasAnyExplicitOrder(tg)) return 30000 + fallbackIdx;
        if (kind === 'assert') return fallbackIdx;
        if (kind === 'config') return 10000 + fallbackIdx;
        if (kind === 'listener') return 15000 + fallbackIdx;
        if (kind === 'tg_variables') return 9500 + fallbackIdx;
        if (kind === 'processor') return 17500 + fallbackIdx;
        return 20000 + fallbackIdx;
    }

    function hasAnyTimelineOrder(tg) {
        if (!tg) return false;
        var i;
        var assertions = getAssertions(tg);
        for (i = 0; i < assertions.length; i++) {
            if (assertions[i] && assertions[i].timeline_order != null) return true;
        }
        var items = tg.config_items || [];
        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].timeline_order != null) return true;
        }
        var steps = tg.steps || [];
        for (i = 0; i < steps.length; i++) {
            if (steps[i] && steps[i].timeline_order != null) return true;
        }
        var LT1 = listenerTimeline();
        if (LT1 && typeof LT1.scanTimelineOrder === 'function') {
            var hit = false;
            LT1.scanTimelineOrder(tg, function (ref) {
                if (ref && ref.timeline_order != null) hit = true;
            });
            if (hit) return true;
        }
        if (hasTgVariables(tg) && tg._variables_block && tg._variables_block.timeline_order != null) return true;
        var procsTl = tg.processors || [];
        for (i = 0; i < procsTl.length; i++) {
            if (procsTl[i] && procsTl[i].timeline_order != null) return true;
        }
        return false;
    }

    function canUse(tg) {
        if (!tg) return false;
        if (hasTgVariables(tg) || hasTgProcessors(tg)) return true;
        if (getAssertions(tg).length > 0) return true;
        if ((tg.steps || []).length > 0) return true;
        if (ImportTimeline && typeof ImportTimeline.canUse === 'function' && ImportTimeline.canUse(tg)) {
            return true;
        }
        var items = tg.config_items || [];
        var i;
        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].type && !items[i].parent_step_id) return true;
        }
        var LT2 = listenerTimeline();
        if (LT2 && typeof LT2.hasAnyEnabled === 'function' && LT2.hasAnyEnabled(tg)) return true;
        return false;
    }

    function buildTopLevelOnlyEntries(tg) {
        var entries = [];
        getAssertions(tg).forEach(function (a, i) {
            if (a) entries.push({ kind: 'assert', ref: a, order: getOrder(a, 'assert', i, tg) });
        });
        (tg.config_items || []).forEach(function (item, i) {
            if (item && item.type && !item.parent_step_id && hasContent(item)) {
                entries.push({ kind: 'config', ref: item, order: getOrder(item, 'config', i, tg) });
            }
        });
        var LT3 = listenerTimeline();
        if (LT3 && typeof LT3.collectTimelineEntries === 'function') {
            LT3.collectTimelineEntries(tg, entries, getOrder);
        }
        (tg.steps || []).forEach(function (step, i) {
            if (step) entries.push({ kind: 'step', ref: step, order: getOrder(step, 'step', i, tg) });
        });
        collectTgAuxEntries(tg, entries);
        entries.sort(function (a, b) { return a.order - b.order; });
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

    function syncOrdersAfterReorder(entries) {
        entries.forEach(function (entry, idx) {
            if (entry.kind === 'tg_variables') {
                var vblock = entry.vblock || ensureVariablesBlock(entry.ref);
                vblock.timeline_order = idx;
                vblock.import_order = idx;
                return;
            }
            if (entry.kind === 'processor') {
                if (entry.ref) {
                    entry.ref.timeline_order = idx;
                    entry.ref.import_order = idx;
                }
                return;
            }
            entry.ref.timeline_order = idx;
            if (entry.kind !== 'assert') {
                entry.ref.import_order = idx;
            }
        });
    }

    function nextTimelineOrder(tg) {
        var max = -1;
        function scan(ref) {
            if (!ref) return;
            var o = ref.timeline_order != null ? ref.timeline_order : ref.import_order;
            if (o != null && o > max) max = o;
        }
        getAssertions(tg).forEach(scan);
        (tg.config_items || []).forEach(scan);
        var LT4 = listenerTimeline();
        if (LT4 && typeof LT4.forEachEnabledConfig === 'function') {
            LT4.forEachEnabledConfig(tg, scan);
        }
        (tg.steps || []).forEach(scan);
        if (hasTgVariables(tg)) scan(tg._variables_block || ensureVariablesBlock(tg));
        (tg.processors || []).forEach(scan);
        return max + 1;
    }

    function persistSortOrder(ref, order) {
        if (!ref || order == null) return;
        ref.timeline_order = order;
        ref.import_order = order;
    }

    function hasSortOrder(ref) {
        return !!(ref && (ref.timeline_order != null || ref.import_order != null));
    }

    function topLevelHasMissingTimelineOrder(tg) {
        if (!tg) return false;
        var i;
        var assertions = getAssertions(tg);
        for (i = 0; i < assertions.length; i++) {
            if (assertions[i] && !hasSortOrder(assertions[i])) return true;
        }
        var items = tg.config_items || [];
        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].type && !items[i].parent_step_id && !hasSortOrder(items[i])) return true;
        }
        var steps = tg.steps || [];
        for (i = 0; i < steps.length; i++) {
            if (steps[i] && !hasSortOrder(steps[i])) return true;
        }
        var LT5 = listenerTimeline();
        if (LT5 && typeof LT5.forEachEnabledConfig === 'function') {
            var missing = false;
            LT5.forEachEnabledConfig(tg, function (ref) {
                if (ref && !hasSortOrder(ref)) missing = true;
            });
            if (missing) return true;
        }
        if (hasTgVariables(tg) && !hasSortOrder(tg._variables_block || ensureVariablesBlock(tg))) return true;
        var procsMiss = tg.processors || [];
        for (i = 0; i < procsMiss.length; i++) {
            if (procsMiss[i] && procsMiss[i].type && !procsMiss[i]._deleted && !hasSortOrder(procsMiss[i])) return true;
        }
        return false;
    }

    function hasTopLevelConfigs(tg) {
        var items = tg.config_items || [];
        var i;
        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].type && !items[i].parent_step_id) return true;
        }
        return false;
    }

    function baselineMissingTimelineOrders(tg, skipRef) {
        if (!tg) return;
        var idx = 0;
        var LT6 = listenerTimeline();
        var hasListeners = LT6 && typeof LT6.hasAnyEnabled === 'function' && LT6.hasAnyEnabled(tg);
        var stepsOnly = (tg.steps || []).length > 0 &&
            !getAssertions(tg).length &&
            !hasTopLevelConfigs(tg) && !hasListeners;

        function assignRef(ref) {
            if (!ref || ref === skipRef || hasSortOrder(ref)) return;
            persistSortOrder(ref, idx++);
        }

        if (stepsOnly) {
            (tg.steps || []).forEach(assignRef);
            return;
        }

        if (!hasAnyTimelineOrder(tg)) {
            getAssertions(tg).forEach(assignRef);
            (tg.config_items || []).forEach(function (item) {
                if (item && item.type && !item.parent_step_id) assignRef(item);
            });
            var LT7 = listenerTimeline();
            if (LT7 && typeof LT7.forEachEnabledConfig === 'function') {
                LT7.forEachEnabledConfig(tg, assignRef);
            }
            (tg.steps || []).forEach(assignRef);
            return;
        }

        var next = nextTimelineOrder(tg);
        buildTopLevelOnlyEntries(tg).forEach(function (entry) {
            if (!entry.ref || entry.ref === skipRef) return;
            if (!hasSortOrder(entry.ref)) persistSortOrder(entry.ref, next++);
        });
    }

    function ensureAllTopLevelHaveTimelineOrder(tg, skipRef) {
        if (!tg || !topLevelHasMissingTimelineOrder(tg)) return;
        baselineMissingTimelineOrders(tg, skipRef);
    }

    function assignAppendTimelineOrder(tg, ref) {
        if (!tg || !ref) return;
        ensureAllTopLevelHaveTimelineOrder(tg, ref);
        if (!hasSortOrder(ref)) {
            persistSortOrder(ref, nextTimelineOrder(tg));
        } else if (ref.timeline_order == null && ref.import_order != null) {
            ref.timeline_order = ref.import_order;
        } else if (ref.import_order == null && ref.timeline_order != null) {
            ref.import_order = ref.timeline_order;
        }
    }

    function reorderTopLevel(tg, fromIndex, toIndex) {
        if (!tg || fromIndex === toIndex) return false;
        var entries = buildTopLevelOnlyEntries(tg);
        if (fromIndex < 0 || fromIndex >= entries.length) return false;
        toIndex = Math.max(0, Math.min(toIndex, entries.length - 1));
        if (fromIndex === toIndex) return true;
        var moved = entries.splice(fromIndex, 1)[0];
        entries.splice(toIndex, 0, moved);
        syncOrdersAfterReorder(entries);
        return true;
    }

    function render(planId, tg, selectedId, helpers) {
        var entries = buildTopLevelEntries(tg);
        var html = '';
        var indexRef = { n: 0 };
        var ConfigUi = global.JmsTgConfigUi;
        var AssertRows = global.JmsTgAssertTreeRows;
        entries.forEach(function (entry) {
            if (entry.kind === 'tg_variables') {
                html += renderVariablesTreeRow(planId, tg);
            } else if (entry.kind === 'processor') {
                html += renderProcessorTreeRow(planId, tg.id, entry.ref, entry.procIndex);
            } else if (entry.kind === 'assert' && AssertRows && typeof AssertRows.renderAssertTreeRow === 'function') {
                html += AssertRows.renderAssertTreeRow(planId, tg.id, entry.ref, getAssertIndex(tg, entry.ref));
            } else if (entry.kind === 'config' && ConfigUi && typeof ConfigUi.renderConfigRow === 'function') {
                html += ConfigUi.renderConfigRow(planId, tg.id, entry.ref);
            } else if (entry.kind === 'listener' && global.JmsTgListenerTreeRows && typeof global.JmsTgListenerTreeRows.renderListenerTreeRow === 'function') {
                html += global.JmsTgListenerTreeRows.renderListenerTreeRow(planId, tg.id, entry.listenerKey, tg);
            } else if (entry.kind === 'step' && helpers && typeof helpers.renderSingleStep === 'function') {
                html += helpers.renderSingleStep(entry.ref, planId, tg.id, 0, indexRef, '', selectedId);
            }
        });
        return html;
    }

    global.JmsTgDetailTimeline = {
        __tgAuxTimelineBuiltIn: true,
        canUse: canUse,
        render: render,
        buildTopLevelOnlyEntries: buildTopLevelOnlyEntries,
        buildTopLevelEntries: buildTopLevelEntries,
        reorderTopLevel: reorderTopLevel,
        assignAppendTimelineOrder: assignAppendTimelineOrder,
        ensureAllTopLevelHaveTimelineOrder: ensureAllTopLevelHaveTimelineOrder,
        hasAnyTimelineOrder: hasAnyTimelineOrder
    };
}(typeof window !== 'undefined' ? window : this));
