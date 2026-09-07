/**
 * JMeter catalog · legacy 网格步骤卡片渲染（隔离模块，不影响树形 renderRow）
 */
(function (global) {
    'use strict';

    function esc(s) {
        if (global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.esc === 'function') {
            return global.JmsTgTreeRenderer.esc(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
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

    function renderActions(planId, tgId, stepId) {
        return '<button type="button" class="jms-btn-ghost jms-btn-edit-catalog" title="编辑">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog jms-tree-del" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(stepId) + '" title="删除">×</button>';
    }

    function renderPlanCard(step, planId, tgId, renderChild) {
        if (!step || step.type !== 'catalog_element') return '';
        var container = !!step.container;
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var badge = esc((step.category || 'cat').slice(0, 3).toUpperCase());
        var childCount = countChildren(step);
        var meta = step.alias ? esc(step.alias) : '';
        var bodyInner = '';
        if (container && typeof renderChild === 'function') {
            bodyInner = (step.children || []).map(function (child) {
                return renderChild(child);
            }).join('');
            if (!bodyInner) {
                bodyInner = '<p class="jms-empty-hint jms-catalog-plan-card__empty">暂无子步骤</p>';
            }
        }
        return '<div class="jms-catalog-plan-card' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<div class="jms-catalog-plan-card__head">' +
            '<span class="jms-catalog-plan-badge">' + badge + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="jms-catalog-plan-card__meta"><code class="hf-mono">' + meta + '</code>' +
            (container ? '<span class="jms-http-assert-badge">' + childCount + ' 个子步骤</span>' : '') +
            '</span>' +
            renderActions(planId, tgId, step.id) +
            '</div>' +
            (container ? '<div class="jms-catalog-plan-card__body">' + bodyInner + '</div>' : '') +
            '</div>';
    }

    global.JmsTgCatalogElementPlan = {
        renderPlanCard: renderPlanCard
    };
})(window);
