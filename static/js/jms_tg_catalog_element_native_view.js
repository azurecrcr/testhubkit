/**
 * JMeter catalog · 树视图原生卡片外观桥接（隔离模块，不影响 legacy 控制器步骤）
 * 将 catalog_element 渲染为与 TXN/LOOP/SIM/RND/Debug 一致的卡片 DOM，保留 catalog 编辑/删除/折叠
 */
(function (global) {
    'use strict';

    var NATIVE_MAP = {
        TransactionController: { node: 'transaction', card: 'jms-transaction-card', badge: 'jms-transaction-badge', badgeText: 'TXN', head: 'jms-transaction-card__head', meta: 'jms-transaction-card__meta', metaText: 'jms-transaction-card__meta-text', childCount: 'jms-transaction-card__child-count', body: 'jms-transaction-card__body', empty: 'jms-transaction-card__empty' },
        LoopController: { node: 'loop', card: 'jms-loop-card', badge: 'jms-loop-badge', badgeText: 'LOOP', head: 'jms-loop-card__head', meta: 'jms-loop-card__meta', metaText: 'jms-loop-card__meta-text', childCount: 'jms-loop-card__child-count', body: 'jms-loop-card__body', empty: 'jms-loop-card__empty' },
        GenericController: { node: 'simple', card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', metaText: 'jms-simple-card__meta-text', childCount: 'jms-simple-card__child-count', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        SimpleController: { node: 'simple', card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', metaText: 'jms-simple-card__meta-text', childCount: 'jms-simple-card__child-count', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        RandomController: { node: 'random', card: 'jms-random-card', badge: 'jms-random-badge', badgeText: 'RND', head: 'jms-random-card__head', meta: 'jms-random-card__meta', metaText: 'jms-random-card__meta-text', childCount: 'jms-random-card__child-count', body: 'jms-random-card__body', empty: 'jms-random-card__empty' }
    };

    function esc(s) {
        if (global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.esc === 'function') {
            return global.JmsTgTreeRenderer.esc(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function renderDragHandle(planId, tgId, stepId, parentStepId) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-step-id="' + esc(stepId) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function countChildren(step) {
        var n = 0;
        (step.children || []).forEach(function (c) {
            if (!c) return;
            n += 1;
            if (c.children) n += countChildren(c);
        });
        return n;
    }

function renderAuxMenuActions(planId, tgId, stepId, editClass, delClass) {
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + editClass + '" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog jms-tree-del" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(stepId) + '" role="menuitem">删除</button>' +
            '</div></div>';
    }

    function renderExpandableHeadToolbar(planId, tgId, step, editClass, delClass, childCount, childCountClass) {
        var actions = renderAuxMenuActions(planId, tgId, step.id, editClass, delClass);
        var E = global.JmsTgTreeStepEnableUnify;
        if (E && typeof E.renderStepToggle === 'function') {
            var toggle = E.renderStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle && typeof E.composeCardToolbar === 'function') {
                actions = E.composeCardToolbar(toggle, actions);
            }
        }
        var S = global.JmsTgTreeHeadBadgeSlots;
        if (S && typeof S.composeLogicHead === 'function') {
            return S.composeLogicHead(childCount, childCountClass, actions);
        }
        return '<div class="jms-card-head-actions">' + actions + '</div>';
    }

    function renderMetaText(step, cfg) {
        var props = step.catalog_props || {};
        if (cfg.node === 'transaction') {
            var parts = [];
            if (props.generate_parent_sample) parts.push('生成父样本');
            if (props.include_timer_duration) parts.push('含定时器耗时');
            return parts.length ? parts.join(' · ') : '标准事务';
        }
        if (cfg.node === 'loop') {
            if (props.loop_forever) return '永远';
            var loops = Number(props.loops);
            return (loops > 0 ? loops : 1) + ' 次';
        }
        if (cfg.node === 'random') {
            return props.ignore_sub_controller_blocks ? '忽略子控制器块' : '标准随机';
        }
        if (props.comments) return String(props.comments).slice(0, 36);
        return '分组容器';
    }


    function renderContainerBodyNative(step, planId, tgId, depth, selectedHttpStepId) {
        var Rows = global.JmsTgIfMountTreeRows;
        var M = global.JmsIfMountModel;
        if (Rows && typeof Rows.renderIfBodyContent === 'function' &&
            M && typeof M.isLogicMountHost === 'function' && M.isLogicMountHost(step)) {
            var mixed = Rows.renderIfBodyContent(step, planId, tgId, (depth || 0) + 1, step.id, selectedHttpStepId || '');
            if (mixed) return mixed;
        }
        return renderChildren(step, planId, tgId, depth, selectedHttpStepId);
    }

    function renderChildren(step, planId, tgId, depth, selectedHttpStepId) {
        if (!global.JmsTgTreeRenderer || typeof global.JmsTgTreeRenderer.renderChildStepNodes !== 'function') {
            return '<p class="jms-empty-hint">暂无子步骤</p>';
        }
        return global.JmsTgTreeRenderer.renderChildStepNodes(
            step.children || [], planId, tgId, depth, step.id, selectedHttpStepId
        ) || '<p class="jms-empty-hint">暂无子步骤</p>';
    }


    function renderMountContextPanel(step, planId, tgId) {
        if (global.JmsCatalogMountContextUi && typeof global.JmsCatalogMountContextUi.renderPanel === 'function') {
            return global.JmsCatalogMountContextUi.renderPanel(step, planId, tgId);
        }
        return '';
    }

    function renderControllerRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId, cfg) {
        depth = depth || 0;
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var childCount = countChildren(step);
        var bodyInner = renderContainerBodyNative(step, planId, tgId, depth, selectedHttpStepId);
        if (!bodyInner) {
            bodyInner = '<p class="jms-empty-hint ' + cfg.empty + '">暂无子步骤</p>';
        }
        var metaText = renderMetaText(step, cfg);
        return '<div class="jms-tree-node jms-tree-node--' + cfg.node + ' jms-tree-node--catalog jms-tree-node--catalog-native" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';" data-step-id="' + esc(step.id) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            renderDragHandle(planId, tgId, step.id, parentStepId) +
            '<div class="jms-tree-node__body">' +
            '<div class="' + cfg.card + ' jms-catalog-card jms-catalog-card--expandable jms-catalog-card--container jms-catalog-card--collapsed' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" data-catalog-native="1" aria-expanded="false">' +
            '<div class="' + cfg.head + ' jms-catalog-card__head">' +
            '<span class="' + cfg.badge + ' jms-catalog-badge">' + cfg.badgeText + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="' + cfg.meta + ' jms-catalog-card__meta">' +
            '<span class="' + cfg.metaText + ' jms-catalog-card__meta-text">' + esc(metaText) + '</span>' +
            '</span>' +
            renderExpandableHeadToolbar(planId, tgId, step, 'jms-btn-edit-catalog', 'jms-btn-del-catalog', childCount, cfg.childCount) +
            '</div>' +
            renderMountContextPanel(step, planId, tgId) +
            '<div class="' + cfg.body + ' jms-catalog-card__body jms-tree-if-children">' + bodyInner + '</div>' +
            '</div></div></div>';
    }


    function renderCatalogSamplerMountBody(step, planId, tgId, depth) {
        if (!step || !global.JmsTgIfMountTreeRows || typeof global.JmsTgIfMountTreeRows.renderRows !== 'function') return '';
        var M = global.JmsIfMountModel;
        if (M && typeof M.isLogicMountHost === 'function' && !M.isLogicMountHost(step)) return '';
        if (M && typeof M.ensureMountFields === 'function') step = M.ensureMountFields(step);
        depth = depth || 1;
        return global.JmsTgIfMountTreeRows.renderRows(step, planId, tgId, depth, step.id) || '';
    }

    function renderDebugRow(step, planId, tgId, depth, parentStepId) {
        depth = depth || 0;
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="jms-tree-node jms-tree-node--debug jms-tree-node--catalog jms-tree-node--catalog-native" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';" data-step-id="' + esc(step.id) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            renderDragHandle(planId, tgId, step.id, parentStepId) +
            '<div class="jms-tree-node__body">' +
            '<div class="jms-aux-card jms-aux-card--debug jms-catalog-card jms-catalog-card--expandable jms-catalog-card--collapsed' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" data-catalog-native="1" aria-expanded="false">' +
            '<div class="jms-catalog-card__head jms-debug-catalog__head">' +
            '<span class="jms-catalog-badge jms-debug-catalog__badge">DEBUG</span>' +
            '<span class="jms-http-name">' + esc(step.name || 'Debug Sampler') + '</span>' +
            '<span class="jms-catalog-card__meta"></span>' +
            renderExpandableHeadToolbar(planId, tgId, step, 'jms-btn-edit-catalog', 'jms-btn-del-catalog', 0, 'jms-tree-child-count-badge') +
            '</div>' +
            renderMountContextPanel(step, planId, tgId) +
            '<div class="jms-catalog-card__body jms-catalog-card__body--summary jms-tree-if-children">' + (renderCatalogSamplerMountBody(step, planId, tgId, depth + 1) || '<p class="jms-empty-hint">点击展开查看挂载区</p>') + '</div>' +
            '</div></div></div>';
    }

    function renderRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        if (!step || step.type !== 'catalog_element' || !step.alias) return '';
        if (step.alias === 'DebugSampler') {
            return renderDebugRow(step, planId, tgId, depth, parentStepId);
        }
        var cfg = NATIVE_MAP[step.alias];
        if (!cfg || !step.container) return '';
        return renderControllerRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId, cfg);
    }

    global.JmsTgCatalogElementNativeView = {
        renderRow: renderRow
    };
})(window);
