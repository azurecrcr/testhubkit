/**
 * 线程组树形时间线 · JMX 导出 parity 补丁（隔离模块）
 * 补渲染：线程组变量、默认请求头(继承)、后置处理器
 */
(function (global) {
    'use strict';

    var PATCHED = false;

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getModel() {
        var vb = global.JmsVisualBuilder;
        return vb && typeof vb.getModel === 'function' ? vb.getModel() : null;
    }


    function tgHasEnabledHeaderManager(tg) {
        if (!tg) return false;
        var Catalog = global.JmsTgConfigCatalog;
        if (Catalog && typeof Catalog.ensureConfigItems === 'function') {
            var items = Catalog.ensureConfigItems(tg);
            var i;
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                if (it && it.type === 'header_manager' && Catalog.isPersistable && Catalog.isPersistable(it)) return true;
            }
        }
        var hm = tg.http_managers && tg.http_managers.header_manager;
        return !!(hm && hm.enabled);
    }

    function planDefaultHeadersObj(model) {
        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.resolvePlanHeaders === 'function') {
            return global.JmsPlanCatalogResolve.resolvePlanHeaders(model);
        }
        if (!model || !Array.isArray(model.default_headers)) return {};
        var out = {};
        model.default_headers.forEach(function (row) {
            var k = row && String(row.key || '').trim();
            if (!k) return;
            out[k] = row.value == null ? '' : String(row.value);
        });
        return out;
    }

    function shouldShowInheritedHeaders(tg, model) {
        var headers = planDefaultHeadersObj(model);
        if (!Object.keys(headers).length) return false;
        return !tgHasEnabledHeaderManager(tg);
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

    function parityOrder(kind, fallbackIdx) {
        if (kind === 'tg_variables') return 9500;
        if (kind === 'inherited_headers') return 10500;
        if (kind === 'processor') return 17500 + fallbackIdx;
        return 30000 + fallbackIdx;
    }

    function hasProcessorEntry(entries, proc) {
        var i;
        for (i = 0; i < entries.length; i++) {
            if (entries[i].kind === 'processor' && entries[i].ref === proc) return true;
        }
        return false;
    }

    function getAssertIndex(tg, ref) {
        var list = (tg && tg.assertions) ? tg.assertions.filter(function (a) { return a && a.type; }) : [];
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i] === ref) return i;
        }
        return 0;
    }

    function collectParityEntries(tg, entries) {
        var model = getModel();
        if (hasTgVariables(tg)) {
            entries.push({ kind: 'tg_variables', ref: tg, order: parityOrder('tg_variables', 0) });
        }
        if (shouldShowInheritedHeaders(tg, model)) {
            entries.push({ kind: 'inherited_headers', ref: { headers: planDefaultHeadersObj(model) }, order: parityOrder('inherited_headers', 0) });
        }
        (tg.processors || []).forEach(function (proc, i) {
            if (!proc || !proc.type || proc._deleted || hasProcessorEntry(entries, proc)) return;
            entries.push({ kind: 'processor', ref: proc, procIndex: i, order: parityOrder('processor', i) });
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
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--beanshell' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-proc-index="' + procIndex + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">PP</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">' + esc(typeLabel) + '</span>' +
            '<span class="jms-aux-name" title="' + esc(proc.name || '') + '">' + esc(proc.name || ('处理器 ' + (procIndex + 1))) + '</span>' +
            '</div>' + actions + '</div></div></div>';
    }

    function renderVariablesTreeRow(planId, tg) {
        var V = global.JmsTgVariablesTimelineUi;
        if (V && typeof V.renderTreeRow === 'function') {
            return V.renderTreeRow(planId, tg, { summary: tgVariablesSummary(tg) });
        }
        var summary = tgVariablesSummary(tg);
        return '<div class="jms-tree-node jms-tree-node--tg-variables" data-depth="0" style="--jms-tree-depth:0;">' +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--tg-config" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">V</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">用户定义的变量</span>' +
            '<span class="jms-aux-name" title="' + esc(summary) + '">' + esc(summary) + '</span>' +
            '</div></div></div></div>';
    }

    function renderInheritedHeadersTreeRow(planId, tg, ref) {
        var keys = Object.keys((ref && ref.headers) || {});
        var summary = keys.map(function (k) { return k + '=' + ref.headers[k]; }).join(', ');
        return '<div class="jms-tree-node jms-tree-node--inherited-headers" data-depth="0" style="--jms-tree-depth:0;">' +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--tg-config jms-aux-card--inherited" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">H</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">默认请求头</span>' +
            '<span class="jms-aux-name" title="' + esc(summary) + '">' + esc(summary) + '</span>' +
            '<span class="jms-aux-badge">场景公共</span>' +
            '</div></div></div></div>';
    }

    function patchDetailTimeline() {
        var DT = global.JmsTgDetailTimeline;
        if (!DT || PATCHED) return false;
        PATCHED = true;

        var origBuild = DT.buildTopLevelOnlyEntries;
        var origCanUse = DT.canUse;
        var origRender = DT.render;

        DT.canUse = function (tg) {
            if (!tg) return false;
            if (hasTgVariables(tg)) return true;
            if ((tg.processors || []).length) return true;
            var model = getModel();
            if (shouldShowInheritedHeaders(tg, model)) return true;
            return origCanUse.call(DT, tg);
        };

        DT.buildTopLevelOnlyEntries = function (tg) {
            var entries = origBuild.call(DT, tg);
            collectParityEntries(tg, entries);
            entries.sort(function (a, b) { return a.order - b.order; });
            return entries;
        };

        DT.render = function (planId, tg, selectedId, helpers) {
            var entries = DT.buildTopLevelEntries(tg);
            var html = '';
            var indexRef = { n: 0 };
            var ConfigUi = global.JmsTgConfigUi;
            var AssertRows = global.JmsTgAssertTreeRows;
            entries.forEach(function (entry) {
                if (entry.kind === 'tg_variables') {
                    html += renderVariablesTreeRow(planId, tg);
                } else if (entry.kind === 'inherited_headers') {
                    html += renderInheritedHeadersTreeRow(planId, tg, entry.ref);
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
        };

        DT.__exportParityPatched = true;
        return true;
    }

    function tryPatch() {
        if (patchDetailTimeline()) return;
        global.setTimeout(tryPatch, 120);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', tryPatch);
    } else {
        tryPatch();
    }
    if (global.addEventListener) global.addEventListener('load', tryPatch);

    global.JmsTgExportParityTimeline = { patchDetailTimeline: patchDetailTimeline };
}(typeof window !== 'undefined' ? window : this));
