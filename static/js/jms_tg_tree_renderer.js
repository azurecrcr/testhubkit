/**
 * JMeter 压测 · 线程组树形渲染（隔离模块，仅 lth-tg-view-tree）
 */
(function (global) {
    'use strict';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function truncate(text, maxLen) {
        text = String(text || '').trim();
        if (!text) return '';
        maxLen = maxLen || 56;
        return text.length <= maxLen ? text : text.slice(0, maxLen) + '…';
    }

    function isCatalogContainerStep(st) {
        return !!(st && st.type === 'catalog_element' && st.container);
    }

    function isCatalogLeafStep(st) {
        return !!(st && st.type === 'catalog_element' && !st.container);
    }

    function countStepsInList(list) {
        var n = 0;
        (list || []).forEach(function (s) {
            if (!s) return;
            if (s.type !== 'catalog_element') return;
            if (isCatalogContainerStep(s)) n += countStepsInList(s.children);
            else n += 1;
        });
        return n;
    }

    function tgLoadSummary(tg) {
        var l = tg.load || {};
        var sc = tg.influx_scenario ? (' · ' + tg.influx_scenario) : '';
        return (l.users || 0) + ' 用户 · ' + (l.duration_sec || 0) + 's' + sc;
    }

    function tgAnyMgrEnabled(tgOrMgr) {
        if (global.JmsTgConfigCatalog && tgOrMgr && typeof tgOrMgr === 'object' && (tgOrMgr.config_items || tgOrMgr.http_managers || tgOrMgr.id)) {
            return global.JmsTgConfigCatalog.anyItems(tgOrMgr);
        }
        var mgr = tgOrMgr || {};
        var sel = mgr.selected_types;
        if (Array.isArray(sel) && sel.length) return true;
        return mgr.http_defaults && mgr.http_defaults.enabled !== false ||
            !!(mgr.header_manager && mgr.header_manager.enabled) ||
            !!(mgr.cookie_manager && mgr.cookie_manager.enabled) ||
            !!(mgr.cache_manager && mgr.cache_manager.enabled) ||
            !!(mgr.csv_data_set && mgr.csv_data_set.enabled) ||
            !!(mgr.counter && mgr.counter.enabled);
    }

    function renderDragHandle(planId, tgId, stepId, parentStepId) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-step-id="' + esc(stepId) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function renderAuxActions(planId, tgId, editClass, delClass) {
        if (global.JmsTgTreeStepActions && typeof global.JmsTgTreeStepActions.renderAuxActions === 'function') {
            return global.JmsTgTreeStepActions.renderAuxActions(editClass, delClass);
        }
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + editClass + '" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-ghost ' + delClass + '" role="menuitem">删除</button>' +
            '</div></div>';
    }

    function renderLogicHeadActions(planId, tgId, step, editClass, delClass) {
        var actions = renderAuxActions(planId, tgId, editClass, delClass);
        var L = global.JmsLogicCtrlEnableUi;
        if (!L || !step || typeof L.renderLogicStepToggle !== 'function' || typeof L.isLogicType !== 'function') {
            return actions;
        }
        if (!L.isLogicType(step.type)) return actions;
        var toggle = L.renderLogicStepToggle(planId, tgId, step.id, step.type, step.enabled);
        if (!toggle) return actions;
        return typeof L.composeCardToolbar === 'function'
            ? L.composeCardToolbar(toggle, actions)
            : actions;
    }


    function renderLogicHeadToolbar(planId, tgId, step, editClass, delClass, childCount, childCountClass) {
        var toolbar = renderLogicHeadActions(planId, tgId, step, editClass, delClass);
        var S = global.JmsTgTreeHeadBadgeSlots;
        if (S && typeof S.composeLogicHead === 'function') {
            return S.composeLogicHead(childCount, childCountClass, toolbar);
        }
        return '<div class="jms-card-head-actions">' + toolbar + '</div>';
    }
    function renderPostprocAuxActions(planId, tgId, step, editClass, delClass) {
        var actions = renderAuxActions(planId, tgId, editClass, delClass);
        var toolbar = actions;
        var P = global.JmsTgPostprocEnableUi;
        if (P && step && typeof P.renderAuxStepToggle === 'function' && typeof P.isPostprocAuxType === 'function'
            && P.isPostprocAuxType(step.type)) {
            var toggle = P.renderAuxStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle) {
                toolbar = typeof P.composeCardToolbar === 'function'
                    ? P.composeCardToolbar(toggle, actions)
                    : actions;
            }
        }
        var SlotsP = global.JmsTgTreeHeadBadgeSlots;
        return (SlotsP && typeof SlotsP.composeAuxHead === 'function') ? SlotsP.composeAuxHead(toolbar) : toolbar;
    }

    function renderHttpHeadActions(planId, tgId, step) {
        var actions = renderHttpActions(planId, tgId);
        var toolbar = actions;
        var En = global.JmsTgSamplerEnableUi;
        if (En && step && typeof En.renderHttpStepToggle === 'function') {
            var toggle = En.renderHttpStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle) {
                toolbar = typeof En.composeCardToolbar === 'function'
                    ? En.composeCardToolbar(toggle, actions)
                    : actions;
            }
        }
        var Slots = global.JmsTgTreeHeadBadgeSlots;
        if (Slots && typeof Slots.composeHttpHead === 'function') {
            return Slots.composeHttpHead(step, toolbar);
        }
        return toolbar;
    }

    function renderDebugAuxActions(planId, tgId, step, editClass, delClass) {
        var actions = renderAuxActions(planId, tgId, editClass, delClass);
        var toolbar = actions;
        var S = global.JmsTgSamplerEnableUi;
        if (S && step && step.type === 'debug_sampler' && typeof S.renderDebugStepToggle === 'function') {
            var toggle = S.renderDebugStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle) {
                toolbar = typeof S.composeCardToolbar === 'function'
                    ? S.composeCardToolbar(toggle, actions)
                    : actions;
            }
        }
        var SlotsD = global.JmsTgTreeHeadBadgeSlots;
        return (SlotsD && typeof SlotsD.composeAuxHead === 'function') ? SlotsD.composeAuxHead(toolbar) : toolbar;
    }

    function renderHttpActions(planId, tgId) {
        if (global.JmsTgTreeStepActions && typeof global.JmsTgTreeStepActions.renderHttpActions === 'function') {
            return global.JmsTgTreeStepActions.renderHttpActions();
        }
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost jms-btn-edit-step" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-ghost jms-btn-del-step" role="menuitem">删除</button>' +
            '<button type="button" class="jms-btn-edit-assert jms-http-assert-trigger-sr" hidden aria-hidden="true" tabindex="-1">断言</button>' +
            '</div></div>';
    }

    function resolveSelectedHttpStepId(planId, tgId, selectedHttpStepId) {
        if (selectedHttpStepId === false) return '';
        if (selectedHttpStepId) return String(selectedHttpStepId);
        if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.getSelected === 'function') {
            return global.JmsHttpContextUi.getSelected(planId, tgId) || '';
        }
        return '';
    }

    function renderSingleStep(step, planId, tgId, depth, indexRef, parentStepId, selectedHttpStepId) {
        if (!step) return '';
        depth = depth || 0;
        indexRef = indexRef || { n: 0 };
        parentStepId = parentStepId || '';
        if (step.type === 'catalog_element' && global.JmsTgCatalogElementTree && typeof global.JmsTgCatalogElementTree.renderRow === 'function') {
            indexRef.n += 1;
            return global.JmsTgCatalogElementTree.renderRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId);
        }
        return '';
    }

    function renderStepNodes(steps, planId, tgId, depth, indexRef, parentStepId, selectedHttpStepId) {
        depth = depth || 0;
        indexRef = indexRef || { n: 0 };
        parentStepId = parentStepId || '';
        var html = '';
        (steps || []).forEach(function (step) {
            html += renderSingleStep(step, planId, tgId, depth, indexRef, parentStepId, selectedHttpStepId);
        });
        return html;
    }

    /** If 挂载区 · 局部刷新子步骤（隔离导出，供 children patch 使用） */
    function renderChildStepNodes(steps, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        return renderStepNodes(steps, planId, tgId, depth || 0, { n: 0 }, parentStepId || '', selectedHttpStepId || '');
    }


    function renderTgAddActions(planId, tgId) {
        return '<div class="jms-tg-add-row lth-tg-add-row jms-tg-tree-head-add">' +
            '<button type="button" class="jms-add-chip jms-btn-add-http jms-tg-tree-btn-primary" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">+ HTTP</button>' +
            '</div>';
    }

    function tgAnyListenerOn(ls) {
        ls = ls || {};
        return !!(ls.view_results_tree || ls.aggregate_report || ls.backend_listener);
    }

    function renderTgMenuShell(wrapCls, triggerCls, menuCls, label, planId, tgId, btnExtra) {
        btnExtra = btnExtra || '';
        return '<div class="' + wrapCls + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">' +
            '<button type="button" class="' + triggerCls + ' jms-tg-tree-btn-ghost' + btnExtra + '" title="' + esc(label) + '" aria-haspopup="true" aria-expanded="false">' +
            esc(label) + '<span class="jms-tg-sampler-caret" aria-hidden="true">▾</span></button>' +
            '<div class="' + menuCls + '" role="menu"></div></div>';
    }

    function renderTgSamplerMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-sampler-more', 'jms-tg-sampler-trigger', 'jms-tg-sampler-menu', '取样器', planId, tg.id);
    }

    function renderTgAssertMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-assert-more', 'jms-tg-assert-trigger', 'jms-tg-assert-menu', '断言', planId, tg.id);
    }

    function renderTgPostProcMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-post-proc-more', 'jms-tg-post-proc-trigger', 'jms-tg-post-proc-menu', '后置处理器', planId, tg.id);
    }

    function renderTgLogicCtrlMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-logic-ctrl-more', 'jms-tg-logic-ctrl-trigger', 'jms-tg-logic-ctrl-menu', '逻辑控制器', planId, tg.id);
    }

    function renderTgListenerMenu(tg, planId) {
        var ls = tg.listeners || {};
        var anyOn = tgAnyListenerOn(ls);
        return renderTgMenuShell('jms-tg-listener-more jms-tg-listeners lth-tg-listeners', 'jms-tg-listener-menu-trigger', 'jms-tg-listener-menu', '监听器', planId, tg.id, anyOn ? ' is-on' : '');
    }

    function renderTgTools(tg, planId) {
        var cfgOn = tgAnyMgrEnabled(tg);
        var configMenu = (global.JmsTgConfigMenuUi && typeof global.JmsTgConfigMenuUi.renderMenu === 'function')
            ? global.JmsTgConfigMenuUi.renderMenu(tg, planId)
            : '<button type="button" class="jms-tg-config-btn jms-tg-tree-btn-ghost' + (cfgOn ? ' is-on' : '') + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '" title="配置元件">配置元件</button>';
        if (!configMenu) {
            configMenu = '<button type="button" class="jms-tg-config-btn jms-tg-tree-btn-ghost' + (cfgOn ? ' is-on' : '') + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '" title="配置元件">配置元件</button>';
        }
        return '<div class="jms-tg-tools jms-tg-tree-tools jms-tg-tree-tools--inline">' +
            '<div class="jms-tg-tree-head__group jms-tg-tree-head__group--settings">' +
            configMenu +
            renderTgLogicCtrlMenu(tg, planId) +
            renderTgSamplerMenu(tg, planId) +
            renderTgPostProcMenu(tg, planId) +
            renderTgAssertMenu(tg, planId) +
            renderTgListenerMenu(tg, planId) +
            '</div>' +
            '</div>';
    }

    function renderTgDetail(planId, tg, kind, selectedHttpStepId) {
        var stepCount = countStepsInList(tg.steps);
        var selectedId = resolveSelectedHttpStepId(planId, tg.id, selectedHttpStepId);
        if (selectedId && global.JmsHttpContextUi && typeof global.JmsHttpContextUi.stepExistsInTg === 'function') {
            var model = global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
                ? global.JmsVisualBuilder.getModel()
                : null;
            if (!global.JmsHttpContextUi.stepExistsInTg(model, planId, tg.id, selectedId)) {
                selectedId = '';
                if (typeof global.JmsHttpContextUi.clearSelected === 'function') {
                    global.JmsHttpContextUi.clearSelected(planId, tg.id);
                }
            }
        }
        var stepsHtml;
        if (global.JmsTgDetailTimeline && typeof global.JmsTgDetailTimeline.canUse === 'function' &&
            global.JmsTgDetailTimeline.canUse(tg)) {
            stepsHtml = global.JmsTgDetailTimeline.render(planId, tg, selectedId, {
                renderSingleStep: renderSingleStep
            });
        } else if (global.JmsTgImportTimeline && typeof global.JmsTgImportTimeline.canUse === 'function' &&
            global.JmsTgImportTimeline.canUse(tg)) {
            stepsHtml = global.JmsTgImportTimeline.render(planId, tg, selectedId, {
                renderSingleStep: renderSingleStep
            });
        } else {
            var assertHtml = (global.JmsTgAssertTreeRows && typeof global.JmsTgAssertTreeRows.renderAssertNodes === 'function')
                ? global.JmsTgAssertTreeRows.renderAssertNodes(planId, tg) : '';
            var configHtml = (global.JmsTgConfigUi && typeof global.JmsTgConfigUi.renderConfigNodes === 'function')
                ? global.JmsTgConfigUi.renderConfigNodes(planId, tg) : '';
            stepsHtml = assertHtml + configHtml + renderStepNodes(tg.steps, planId, tg.id, 0, { n: 0 }, '', selectedId);
        }
        if (!stepsHtml) {
            stepsHtml = '<p class="jms-empty-hint jms-tree-empty">暂无线程步骤，可通过「取样器」→「HTTP请求」添加</p>';
        }
        var setupTag = kind === 'setup' ? '<span class="jms-tree-setup-tag">Setup</span>' : (kind === 'post' ? '<span class="jms-tree-setup-tag jms-tree-post-tag">Post</span>' : '');
        return '<div class="jms-tg-tree-main">' +
            '<div class="jms-tg-block jms-tg-block--tree" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<div class="jms-tg-head jms-tg-tree-head jms-tg-tree-head--single">' +
            '<span class="jms-tg-icon jms-tg-tree-head__icon">⚙</span>' +
            setupTag +
            '<input type="text" class="jms-tg-name jms-tg-name--tree" value="' + esc(tg.name) + '" placeholder="线程组名称" />' +
            renderTgTools(tg, planId) +
            '<span class="jms-tg-tree-head__meta">' +
            '<span class="jms-tg-load-badge">' + esc(tgLoadSummary(tg)) + '</span>' +
            '<span class="jms-tree-step-count">' + stepCount + ' 步</span>' +
            '</span>' +
            '</div>' +
            '<div class="jms-tg-steps jms-tg-tree-steps">' + stepsHtml + '</div>' +
            '</div></div>';
    }

    function collectThreadGroups(model, planId) {
        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.collectInDisplayOrder === 'function') {
            return global.JmsTgDisplayOrder.collectInDisplayOrder(model, planId);
        }
        var list = [];
        if (!model) return list;
        (model.setup_thread_groups || []).forEach(function (tg) {
            list.push({ key: 'setup:' + tg.id, tg: tg, planId: planId, kind: 'setup', isSetup: true, isPost: false });
        });
        var plan = (model.test_plans || []).find(function (p) { return String(p.id) === String(planId); });
        if (plan) {
            (plan.thread_groups || []).forEach(function (tg) {
                list.push({ key: tg.id, tg: tg, planId: planId, kind: 'thread', isSetup: false, isPost: false });
            });
        }
        (model.post_thread_groups || []).forEach(function (tg) {
            list.push({ key: 'post:' + tg.id, tg: tg, planId: planId, kind: 'post', isSetup: false, isPost: true });
        });
        return list;
    }


    function renderNavHead(planId) {
        return '<div class="jms-tg-tree-nav__head">' +
            '<span class="jms-tg-tree-nav__title">线程组</span>' +
            '<button type="button" class="jms-tg-tree-nav__add-btn jms-btn-add-tg" data-plan-id="' + esc(planId) + '" aria-label="添加线程组" title="添加 Setup / 主流程 / 清理线程组">＋</button>' +
            '<div class="jms-tg-tree-nav__head-right" aria-hidden="false"></div>' +
            '</div>';
    }

    function renderNav(model, planId, activeKey) {
        var groups = collectThreadGroups(model, planId);
        if (!groups.length) {
            return '<nav class="jms-tg-tree-nav" aria-label="线程组导航">' + renderNavHead(planId) + '<p class="jms-empty-hint">暂无线程组</p></nav>';
        }
        var navIdx = 0;
        var items = groups.map(function (item) {
            var tg = item.tg;
            var active = item.key === activeKey ? ' is-active' : '';
            var stepCount = countStepsInList(tg.steps);
            navIdx += 1;
            var prefix = String(navIdx);
            var delHtml =
                '<button type="button" class="jms-tg-tree-nav__del" aria-label="删除线程组" title="删除线程组"' +
                ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '" data-tg-kind="' + esc(item.kind || 'thread') + '">' +
                '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
                '<path fill="currentColor" d="M5.5 1.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V2h2.5a.5.5 0 0 1 0 1H12v9.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 12.5V3H3a.5.5 0 0 1 0-1h2.5v-.5zm1 0v.5h3v-.5h-3zM5 3v9.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V3H5zm2 2.75a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-1 0V6.25a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-1 0V6.25a.5.5 0 0 1 .5-.5z"/>' +
                '</svg></button>';
            return '<div class="jms-tg-tree-nav__item' + active + '" data-tg-key="' + esc(item.key) + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
                '<button type="button" class="jms-tg-tree-nav__main">' +
                '<span class="jms-tg-tree-nav__idx">' + esc(prefix) + '</span>' +
                '<span class="jms-tg-tree-nav__body">' +
                '<span class="jms-tg-tree-nav__name">' + esc(tg.name) + '</span>' +
                '<span class="jms-tg-tree-nav__meta">' + stepCount + ' 步 · ' + esc(tgLoadSummary(tg)) + '</span>' +
                '</span></button>' + delHtml + '</div>';
        }).join('');
        return '<nav class="jms-tg-tree-nav" aria-label="线程组导航">' +
            renderNavHead(planId) +
            '<div class="jms-tg-tree-nav__list">' + items + '</div>' +
            '<div class="jms-tg-tree-nav__foot">' + groups.length + ' 个线程组</div>' +
            '</nav>';
    }

    function renderWorkspace(model, planId, activeKey) {
        var groups = collectThreadGroups(model, planId);
        if (!activeKey && groups.length) activeKey = groups[0].key;
        var active = groups.find(function (g) { return g.key === activeKey; }) || groups[0];
        var detailHtml = active
            ? renderTgDetail(active.planId, active.tg, active.kind || (active.isSetup ? 'setup' : 'thread'))
            : '<div class="jms-tg-tree-main"><p class="jms-empty-hint">请选择线程组</p></div>';
        return '<div class="jms-tg-tree-workspace">' +
            renderNav(model, planId, activeKey) +
            detailHtml +
            '</div>';
    }

    function findActiveGroup(model, planId, activeKey) {
        var groups = collectThreadGroups(model, planId);
        if (!activeKey) return groups[0] || null;
        return groups.find(function (g) { return g.key === activeKey; }) || groups[0] || null;
    }

    function renderDetailPanel(model, planId, activeKey, selectedHttpStepId) {
        var active = findActiveGroup(model, planId, activeKey);
        if (!active) {
            return '<div class="jms-tg-tree-main"><p class="jms-empty-hint">请选择线程组</p></div>';
        }
        return renderTgDetail(
            active.planId,
            active.tg,
            active.kind || (active.isSetup ? 'setup' : 'thread'),
            selectedHttpStepId
        );
    }

    global.JmsTgTreeRenderer = {
        collectThreadGroups: collectThreadGroups,
        countStepsInList: countStepsInList,
        renderNav: renderNav,
        renderWorkspace: renderWorkspace,
        renderDetailPanel: renderDetailPanel,
        findActiveGroup: findActiveGroup,
        renderChildStepNodes: renderChildStepNodes
    };
}(typeof window !== 'undefined' ? window : this));
