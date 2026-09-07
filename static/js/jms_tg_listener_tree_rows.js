/**
 * 线程组 · 监听器树形行（独立模块，对齐断言/配置元件样式，支持拖动）
 */
(function (global) {
    'use strict';

    var LT = function () { return global.JmsTgListenerTimeline; };

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function refreshTgTree(planId, tgId) {
        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.refreshTgDetailByTgId === 'function') {
            return global.JmsTgTreeShell.refreshTgDetailByTgId(planId, tgId);
        }
        return false;
    }

    function markDirty(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        refreshTgTree(planId, tgId);
    }

    function renderListenerDragHandle(planId, tgId, listenerKey) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-tg-listener-key="' + esc(listenerKey) + '" data-parent-step-id="">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }


    function renderStepActionsMenu(editBtnHtml, delBtnHtml) {
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="监听器操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' + editBtnHtml + delBtnHtml + '</div></div>';
    }
    function composeListenerActions(planId, tgId, listenerKey, enabled, actionsHtml) {
        var Ui = global.JmsListenerEnableUi;
        if (!Ui || typeof Ui.renderTgListenerToggle !== 'function') return actionsHtml;
        var toggle = Ui.renderTgListenerToggle(planId, tgId, listenerKey, enabled);
        return Ui.composeCardToolbar ? Ui.composeCardToolbar(toggle, actionsHtml) : actionsHtml;
    }
    function renderListenerTreeRow(planId, tgId, listenerKey, tg) {
        var timeline = LT();
        var name = timeline && typeof timeline.listenerDisplayName === 'function'
            ? timeline.listenerDisplayName(tg, listenerKey)
            : (listenerKey || '监听器');
        var shortLabel = listenerKey === 'view_results_tree' ? 'VRT'
            : listenerKey === 'aggregate_report' ? 'Agg'
            : listenerKey === 'backend_listener' ? 'BL' : 'L';
        var LEn = global.JmsListenerEnableUi;
        var cardEnabled = LEn && typeof LEn.isTgListenerActive === 'function'
            ? LEn.isTgListenerActive(tg, listenerKey) : true;
        var disabledCls = cardEnabled ? '' : ' is-disabled';
        var editBtn = '<button type="button" class="jms-btn-ghost jms-tg-listener-edit" role="menuitem" data-tg-listener-key="' + esc(listenerKey) + '"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">编辑</button>';
        var delBtn = '<button type="button" class="jms-btn-ghost jms-tg-listener-del" role="menuitem" data-tg-listener-key="' + esc(listenerKey) + '"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">删除</button>';
        return '<div class="jms-tree-node jms-tree-node--tg-listener" data-depth="0" style="--jms-tree-depth:0;"' +
            ' data-tg-listener-key="' + esc(listenerKey) + '">' +
            renderListenerDragHandle(planId, tgId, listenerKey) +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--tg-listener' + disabledCls + '"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-tg-listener-key="' + esc(listenerKey) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">L</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">' + esc(shortLabel) + '</span>' +
            '<span class="jms-aux-name" title="' + esc(name) + '">' + esc(name) + '</span>' +
            '</div>' +
            composeListenerActions(planId, tgId, listenerKey, cardEnabled, renderStepActionsMenu(editBtn, delBtn)) +
            '</div></div></div>';
    }

    function renderListenerNodes(planId, tg) {
        if (!tg) return '';
        var timeline = LT();
        if (!timeline || !timeline.hasAnyEnabled(tg)) return '';
        var html = '';
        timeline.KEYS.forEach(function (key) {
            if (timeline.isEnabled(tg, key)) {
                html += renderListenerTreeRow(planId, tg.id, key, tg);
            }
        });
        return html;
    }

    function openEditor(planId, tgId, listenerKey) {
        if (global.JmsTgListenerCatalogBridge &&
            typeof global.JmsTgListenerCatalogBridge.openEditor === 'function') {
            return !!global.JmsTgListenerCatalogBridge.openEditor(planId, tgId, listenerKey);
        }
        return false;
    }


    function requestDeleteListener(planId, tgId, listenerKey) {
        if (listenerKey === 'view_results_tree') {
            var ConfirmUi = global.JmsTgVrtDeleteConfirmUi;
            if (ConfirmUi && typeof ConfirmUi.confirm === 'function') {
                var label = '查看结果树';
                var vb = global.JmsVisualBuilder;
                if (vb && typeof vb.getModel === 'function') {
                    var tg = findTg(vb.getModel(), planId, tgId);
                    var timeline = LT();
                    if (timeline && typeof timeline.listenerDisplayName === 'function') {
                        label = timeline.listenerDisplayName(tg, listenerKey);
                    }
                }
                ConfirmUi.confirm({ name: label }).then(function (ok) {
                    if (ok) deleteListener(planId, tgId, listenerKey);
                });
                return;
            }
            var Del = global.JmsComponentDelete;
            if (Del && typeof Del.confirm === 'function') {
                Del.confirm({ title: '删除查看结果树', name: label }).then(function (ok) { if (ok) performDelete(); });
                return;
            }
            if (!global.confirm('确定删除「查看结果树」吗？')) return;
        }
        deleteListener(planId, tgId, listenerKey);
    }

    function deleteListener(planId, tgId, listenerKey) {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return false;
        var tg = findTg(vb.getModel(), planId, tgId);
        if (!tg || !listenerKey) return false;
        var timeline = LT();
        if (timeline && typeof timeline.disableListener === 'function') {
            timeline.disableListener(tg, listenerKey);
        } else if (tg.listeners) {
            tg.listeners[listenerKey] = false;
        }
        markDirty(planId, tgId);
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var wrap = card && card.querySelector('.jms-tg-listener-more[data-tg-id="' + tgId + '"]');
        if (wrap && global.JmsTgListenerMenuUi && typeof global.JmsTgListenerMenuUi.patchMenuUi === 'function') {
            global.JmsTgListenerMenuUi.patchMenuUi(wrap, tg.listeners);
        }
        return true;
    }

    function onDocumentClick(ev) {
        if (!global.document.body.classList.contains('lth-tg-view-tree') ||
            !global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var editBtn = ev.target.closest('.jms-tg-listener-edit');
        if (editBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            openEditor(
                editBtn.getAttribute('data-plan-id'),
                editBtn.getAttribute('data-tg-id'),
                editBtn.getAttribute('data-tg-listener-key')
            );
            return;
        }
        var delBtn = ev.target.closest('.jms-tg-listener-del');
        if (delBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            requestDeleteListener(
                delBtn.getAttribute('data-plan-id'),
                delBtn.getAttribute('data-tg-id'),
                delBtn.getAttribute('data-tg-listener-key')
            );
        }
    }

    function bind() {
        if (global.document.body.dataset.jmsTgListenerTreeRowsBound === '1') return;
        global.document.body.dataset.jmsTgListenerTreeRowsBound = '1';
        global.document.addEventListener('click', onDocumentClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgListenerTreeRows = {
        renderListenerTreeRow: renderListenerTreeRow,
        renderListenerNodes: renderListenerNodes,
        refreshTgTree: refreshTgTree,
        markDirty: markDirty,
        openEditor: openEditor,
        deleteListener: deleteListener
    };
}(typeof window !== 'undefined' ? window : this));
