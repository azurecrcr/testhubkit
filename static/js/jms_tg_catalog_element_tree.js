/**
 * JMeter catalog · 树视图渲染 catalog_element（隔离模块）
 */
(function (global) {
    'use strict';

    var ALIAS_BADGE = {
        TransactionController: 'TXN',
        LoopController: 'LOOP',
        GenericController: 'SIM',
        SimpleController: 'SIM',
        RandomController: 'RND',
        IfController: 'IF',
        DebugSampler: 'DBG'
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

    function resolveBadge(step) {
        if (step.alias && ALIAS_BADGE[step.alias]) return ALIAS_BADGE[step.alias];
        return String(step.category || 'cat').slice(0, 3).toUpperCase();
    }


    function renderContainerBody(step, planId, tgId, depth, selectedHttpStepId) {
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
        var html = global.JmsTgTreeRenderer.renderChildStepNodes(
            step.children || [], planId, tgId, depth, step.id, selectedHttpStepId
        );
        return html || '<p class="jms-empty-hint jms-catalog-card__empty">暂无子步骤</p>';
    }

    function formatSummaryValue(field, val) {
        if (field.type === 'checkbox') return val ? '是' : '否';
        if (Array.isArray(val)) return val.join(', ');
        if (val == null || val === '') return '';
        return String(val);
    }

    function renderMetaText(step) {
        var props = step.catalog_props || {};
        if (step.alias === 'TransactionController') {
            var parts = [];
            if (props.generate_parent_sample) parts.push('生成父样本');
            if (props.include_timer_duration) parts.push('含定时器耗时');
            return parts.length ? parts.join(' · ') : '标准事务';
        }
        if (step.alias === 'LoopController') {
            if (props.loop_forever) return '永远';
            var loops = Number(props.loops);
            return (loops > 0 ? loops : 1) + ' 次';
        }
        if (step.alias === 'RandomController') {
            return props.ignore_sub_controller_blocks ? '忽略子控制器块' : '标准随机';
        }
        if (props.comments) return String(props.comments).slice(0, 36);
        return step.alias ? esc(step.alias) : '';
    }

    function renderLeafSummary(step) {
        var S = global.JmsCatalogElementEditorSchema;
        var props = step.catalog_props || (S && typeof S.defaultProps === 'function' ? S.defaultProps(step) : {});
        var schema = S && typeof S.getSchema === 'function' ? S.getSchema(step) : { fields: [] };
        var rows = (schema.fields || []).slice(0, 5).map(function (f) {
            var v = formatSummaryValue(f, props[f.key]);
            if (!v) return '';
            return '<div class="jms-catalog-card__summary-row">' +
                '<span class="jms-catalog-card__summary-label">' + esc(f.label) + '</span>' +
                '<span class="jms-catalog-card__summary-val">' + esc(v.length > 80 ? v.slice(0, 79) + '…' : v) + '</span></div>';
        }).filter(Boolean).join('');
        var comments = props.comments
            ? '<div class="jms-catalog-card__summary-comments">' + esc(props.comments) + '</div>' : '';
        if (rows || comments) return rows + comments;
        return '<p class="jms-empty-hint jms-catalog-card__empty">点击头部展开查看配置摘要</p>';
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

    function renderMountContextPanel(step, planId, tgId) {
        if (global.JmsCatalogMountContextUi && typeof global.JmsCatalogMountContextUi.renderPanel === 'function') {
            return global.JmsCatalogMountContextUi.renderPanel(step, planId, tgId);
        }
        return '';
    }


    function renderCatalogSamplerMountBody(step, planId, tgId, depth) {
        if (!step || !global.JmsTgIfMountTreeRows || typeof global.JmsTgIfMountTreeRows.renderRows !== 'function') return '';
        var M = global.JmsIfMountModel;
        if (M && typeof M.isLogicMountHost === 'function' && !M.isLogicMountHost(step)) return '';
        if (M && typeof M.ensureMountFields === 'function') step = M.ensureMountFields(step);
        depth = depth || 1;
        return global.JmsTgIfMountTreeRows.renderRows(step, planId, tgId, depth, step.id) || '';
    }

    function renderRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        if (!step || step.type !== 'catalog_element') return '';
        if (global.JmsTgCatalogElementNativeView && typeof global.JmsTgCatalogElementNativeView.renderRow === 'function') {
            var bridged = global.JmsTgCatalogElementNativeView.renderRow(
                step, planId, tgId, depth, parentStepId, selectedHttpStepId
            );
            if (bridged) return bridged;
        }
        depth = depth || 0;
        var childCount = countChildren(step);
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var MountUi = global.JmsCatalogMountContextUi;
        var isSamplerLeaf = MountUi && typeof MountUi.isCatalogSampler === 'function' && MountUi.isCatalogSampler(step);
        var container = !!step.container;
        var expandableCls = ' jms-catalog-card--expandable';
        var containerCls = container ? ' jms-catalog-card--container' : '';
        if (isSamplerLeaf) expandableCls = ' jms-catalog-card--expandable jms-catalog-card--sampler';
        var badge = esc(resolveBadge(step));
        var mountPanel = renderMountContextPanel(step, planId, tgId);
        var bodyInner = container
            ? renderContainerBody(step, planId, tgId, depth, selectedHttpStepId)
            : (isSamplerLeaf ? renderCatalogSamplerMountBody(step, planId, tgId, depth + 1) : renderLeafSummary(step));
        var metaText = renderMetaText(step);
        var catalogHeadActions = renderExpandableHeadToolbar(
            planId, tgId, step, 'jms-btn-edit-catalog', 'jms-btn-del-catalog',
            container ? childCount : 0,
            'jms-catalog-card__child-count'
        );
        return '<div class="jms-tree-node jms-tree-node--catalog" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';" data-step-id="' + esc(step.id) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            renderDragHandle(planId, tgId, step.id, parentStepId) +
            '<div class="jms-tree-node__body"><div class="jms-catalog-card' + expandableCls + containerCls + disabled + ' jms-catalog-card--collapsed" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" aria-expanded="false">' +
            '<div class="jms-catalog-card__head">' +
            '<span class="jms-catalog-badge">' + badge + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="jms-catalog-card__meta">' +
            (metaText ? '<span class="jms-catalog-card__meta-text">' + esc(metaText) + '</span>' : '') +
            '</span>' +
            catalogHeadActions +
            '</div>' +
            mountPanel +
            '<div class="jms-catalog-card__body' + (container ? ' jms-tree-if-children' : ' jms-catalog-card__body--summary') + '">' + bodyInner + '</div>' +
            '</div></div></div>';
    }

    global.JmsTgCatalogElementTree = {
        renderRow: renderRow
    };
})(window);
