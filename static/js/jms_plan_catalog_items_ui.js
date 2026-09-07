/**
 * 测试计划级 catalog 元件 UI（渲染 + 导航同步）
 */
(function (global) {
    'use strict';

    var CAT_LABELS = {
        listener: '监听器',
        config: '配置元件',
        other: '其他元件'
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function getModel() {
        var vb = global.JmsVisualBuilder;
        return vb && typeof vb.getModel === 'function' ? vb.getModel() : null;
    }

    function resolvePlanId(planId) {
        if (planId) return planId;
        var m = getModel();
        var plans = m && m.test_plans;
        return plans && plans[0] ? plans[0].id : '';
    }

    function syncNavPlanId(planId) {
        planId = resolvePlanId(planId);
        if (!planId) return;
        global.document.querySelectorAll('[data-plan-catalog-nav="1"] .jms-plan-catalog-more').forEach(function (wrap) {
            wrap.setAttribute('data-plan-id', planId);
        });
    }

    function categoryBadge(step) {
        var cat = (step && step.category) || 'other';
        if (cat === 'listener') return 'LIS';
        if (cat === 'config') return 'CFG';
        if (cat === 'thread_group') return 'TG';
        return 'CAT';
    }

    function renderCard(step, planId) {
        if (!step || step.type !== 'catalog_element') return '';
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var meta = step.label_zh && step.label_zh !== step.name
            ? step.label_zh
            : (step.alias || step.testclass || '');
        return '<div class="jms-plan-catalog-card jms-catalog-card' + disabled + '" data-plan-level="1" data-plan-id="' + esc(planId) + '" data-tg-id="" data-step-id="' + esc(step.id) + '">' +
            '<div class="jms-plan-catalog-card__head">' +
            '<div class="jms-plan-catalog-card__main">' +
            '<span class="jms-plan-catalog-badge">' + esc(categoryBadge(step)) + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '</div>' +
            '<span class="jms-plan-catalog-meta">' + esc(meta) + '</span>' +
            '<div class="jms-plan-catalog-card__actions">' +
            '<button type="button" class="jms-btn-ghost jms-btn-edit-catalog" title="编辑">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog" data-plan-id="' + esc(planId) + '" data-tg-id="" data-step-id="' + esc(step.id) + '" title="删除" aria-label="删除">×</button>' +
            '</div></div></div>';
    }

    function renderToolbar(planId) {
        var html = '';
        ['listener', 'config', 'other'].forEach(function (cat) {
            html += '<div class="jms-plan-catalog-more jms-plan-catalog-more--' + cat + '" data-plan-id="' + esc(planId) + '">' +
                '<button type="button" class="jms-plan-catalog-add-btn jms-plan-catalog-trigger jms-plan-catalog-trigger--' + cat + '" data-plan-catalog-cat="' + cat + '">+' + esc(CAT_LABELS[cat]) + '</button>' +
                '<div class="jms-plan-catalog-menu jms-plan-catalog-menu--' + cat + '" aria-hidden="true"></div>' +
                '</div>';
        });
        return html;
    }

    function renderSection(planId, items) {
        planId = resolvePlanId(planId);
        items = items || [];
        var cards = items.map(function (step) { return renderCard(step, planId); }).join('');
        if (!cards) {
            cards = '<p class="jms-plan-catalog-empty">暂无计划级元件。可点击右侧按钮从 JMeter 官方元件表添加监听器、配置元件等。</p>';
        }
        var countBadge = items.length
            ? (' <span class="jms-plan-catalog-count">' + items.length + '</span>')
            : '';
        return '<section class="jms-plan-catalog-section" data-plan-id="' + esc(planId) + '" aria-label="测试计划元件">' +
            '<div class="jms-plan-catalog-section__head">' +
            '<div><p class="jms-plan-catalog-section__title">测试计划元件' + countBadge + '</p>' +
            '<p class="jms-plan-catalog-section__hint">官方计划级元件：监听器、配置元件、其他元件（含插件）。线程组 / SetUp / TearDown 在下方独立管理，不属于本区。</p></div>' +
            '<div class="jms-plan-catalog-section__toolbar">' + renderToolbar(planId) + '</div>' +
            '</div>' +
            '<div class="jms-plan-catalog-items">' + cards + '</div>' +
            '</section>';
    }

    /**
     * 左侧「场景配置」不再注入计划级添加入口，避免与右侧「测试计划元件」工具栏重复。
     * 仅清理历史注入的导航组；添加入口统一走 section toolbar（+监听器/+配置元件/+其他元件）。
     */
    function ensureNavGroup() {
        var navBody = global.document.getElementById('lth-studio-nav-body');
        if (!navBody) return;
        navBody.querySelectorAll('[data-plan-catalog-nav="1"]').forEach(function (el) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
    }

    function init() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        ensureNavGroup();
        syncNavPlanId();
        if (global.JmsCatalogMenuV2 && typeof global.JmsCatalogMenuV2.init === 'function') {
            global.JmsCatalogMenuV2.init();
        }
    }

    global.JmsPlanCatalogItemsUi = {
        renderSection: renderSection,
        syncNavPlanId: syncNavPlanId,
        ensureNavGroup: ensureNavGroup,
        init: init
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
