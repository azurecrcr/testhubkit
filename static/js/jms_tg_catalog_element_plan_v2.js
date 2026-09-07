/**
 * JMeter catalog · legacy 网格步骤区原生卡片渲染（v2 · 对齐 transaction/loop 卡片）
 */
(function (global) {
    'use strict';

    var CTRL = {
        TransactionController: { card: 'jms-transaction-card', badge: 'jms-transaction-badge', badgeText: 'TXN', head: 'jms-transaction-card__head', meta: 'jms-transaction-card__meta', body: 'jms-transaction-card__body', empty: 'jms-transaction-card__empty' },
        LoopController: { card: 'jms-loop-card', badge: 'jms-loop-badge', badgeText: 'LOOP', head: 'jms-loop-card__head', meta: 'jms-loop-card__meta', body: 'jms-loop-card__body', empty: 'jms-loop-card__empty' },
        GenericController: { card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        SimpleController: { card: 'jms-simple-card', badge: 'jms-simple-badge', badgeText: 'SIM', head: 'jms-simple-card__head', meta: 'jms-simple-card__meta', body: 'jms-simple-card__body', empty: 'jms-simple-card__empty' },
        RandomController: { card: 'jms-random-card', badge: 'jms-random-badge', badgeText: 'RND', head: 'jms-random-card__head', meta: 'jms-random-card__meta', body: 'jms-random-card__body', empty: 'jms-random-card__empty' }
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function countSteps(list) {
        var n = 0;
        (list || []).forEach(function (c) {
            if (!c) return;
            n += 1;
            if (c.children && c.children.length) n += countSteps(c.children);
        });
        return n;
    }

    function renderCatalogActions(planId, tgId, stepId) {
        return '<button type="button" class="jms-btn-ghost jms-btn-edit-catalog" title="编辑">编辑</button>' +
            '<button type="button" class="jms-btn-del-catalog" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(stepId) + '" title="删除">×</button>';
    }

    function metaText(step, cfg) {
        var props = step.catalog_props || {};
        if (cfg.card === 'jms-transaction-card') {
            var p = [];
            if (props.generate_parent_sample) p.push('生成父样本');
            if (props.include_timer_duration) p.push('含定时器耗时');
            return p.length ? p.join(' · ') : '标准事务';
        }
        if (cfg.card === 'jms-loop-card') {
            if (props.loop_forever) return '永远';
            return (Number(props.loops) > 0 ? Number(props.loops) : 1) + ' 次';
        }
        if (cfg.card === 'jms-random-card') {
            return props.ignore_sub_controller_blocks ? '忽略子控制器块' : '标准随机';
        }
        return props.comments ? String(props.comments).slice(0, 36) : '分组容器';
    }

    function renderController(step, planId, tgId, cfg, renderChild) {
        var childCount = countSteps(step.children);
        var bodyInner = (step.children || []).map(function (child) {
            return renderChild(child);
        }).join('');
        if (!bodyInner) bodyInner = '<p class="jms-empty-hint ' + cfg.empty + '">暂无子步骤</p>';
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="' + cfg.card + ' jms-catalog-plan-native' + disabled + '" data-catalog-native="1" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<div class="' + cfg.head + '">' +
            '<span class="' + cfg.badge + '">' + cfg.badgeText + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            '<span class="' + cfg.meta + '">' + esc(metaText(step, cfg)) + '</span>' +
            '<span class="jms-http-assert-badge">' + childCount + ' 个子步骤</span>' +
            renderCatalogActions(planId, tgId, step.id) +
            '</div>' +
            '<div class="' + cfg.body + '">' + bodyInner + '</div></div>';
    }

    function renderDebug(step, planId, tgId) {
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="jms-aux-card jms-aux-card--debug jms-catalog-plan-native' + disabled + '" data-catalog-native="1" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">?</span>' +
            '<div class="jms-aux-card__content">' +
            '<span class="jms-aux-type">Debug</span>' +
            '<span class="jms-aux-name">' + esc(step.name || 'Debug Sampler') + '</span>' +
            '</div>' +
            renderCatalogActions(planId, tgId, step.id) +
            '</div>';
    }

    function renderLeaf(step, planId, tgId) {
        var badge = esc((step.category || 'cat').slice(0, 3).toUpperCase());
        var disabled = step.enabled === false ? ' is-disabled' : '';
        return '<div class="jms-catalog-plan-card jms-catalog-plan-native' + disabled + '" data-catalog-native="1" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '">' +
            '<div class="jms-catalog-plan-card__head">' +
            '<span class="jms-catalog-plan-badge">' + badge + '</span>' +
            '<span class="jms-http-name">' + esc(step.name || step.label_zh || step.alias) + '</span>' +
            renderCatalogActions(planId, tgId, step.id) +
            '</div></div>';
    }

    function renderPlanCard(step, planId, tgId, renderChild) {
        if (!step || step.type !== 'catalog_element') return '';
        if (step.alias === 'DebugSampler') return renderDebug(step, planId, tgId);
        var cfg = step.alias && CTRL[step.alias];
        if (cfg && step.container) return renderController(step, planId, tgId, cfg, renderChild);
        if (global.JmsTgCatalogElementPlan && typeof global.JmsTgCatalogElementPlan.renderPlanCard === 'function') {
            return global.JmsTgCatalogElementPlan.renderPlanCard(step, planId, tgId, renderChild);
        }
        return renderLeaf(step, planId, tgId);
    }

    global.JmsTgCatalogElementPlanV2 = { renderPlanCard: renderPlanCard };
})(window);
