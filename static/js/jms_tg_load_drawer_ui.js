/**
 * 压测负载抽屉 · 线程组识别与卡片渲染（隔离模块 · #modal-tg-load）
 */
(function (global) {
    'use strict';

    function kindBadge(kind) {
        if (kind === 'setup') return 'SetUp';
        if (kind === 'post') return 'tearDown';
        return '线程组';
    }

    function cardKindClass(kind) {
        if (kind === 'setup') return 'jms-tg-load-card--setup';
        if (kind === 'post') return 'jms-tg-load-card--post';
        return 'jms-tg-load-card--thread';
    }

    function badgeKindClass(kind) {
        if (kind === 'setup') return 'jms-tg-load-kind-badge--setup';
        if (kind === 'post') return 'jms-tg-load-kind-badge--post';
        return 'jms-tg-load-kind-badge--thread';
    }

    function formatEntryLabel(planName, tg, kind) {
        var name = (tg && tg.name) ? String(tg.name) : '未命名';
        return String(planName || '场景') + ' / ' + kindBadge(kind) + ' · ' + name;
    }

    /** 收集抽屉内全部线程组（含 SetUp / tearDown / 主线程组，按 display_seq 排序） */
    function collectEntries(model) {
        var list = [];
        if (!model) return list;
        var plans = model.test_plans || [];
        if (!plans.length) return list;

        plans.forEach(function (plan, planIndex) {
            var planName = plan.name || ('测试计划 ' + (planIndex + 1));
            if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.collectInDisplayOrder === 'function') {
                global.JmsTgDisplayOrder.collectInDisplayOrder(model, plan.id).forEach(function (item) {
                    list.push({
                        plan: plan,
                        planIndex: planIndex,
                        tg: item.tg,
                        kind: item.kind || 'thread',
                        label: formatEntryLabel(planName, item.tg, item.kind || 'thread')
                    });
                });
                return;
            }
            (model.setup_thread_groups || []).forEach(function (tg, ti) {
                list.push({
                    plan: plan,
                    planIndex: planIndex,
                    tg: tg,
                    kind: 'setup',
                    label: formatEntryLabel(planName, tg, 'setup')
                });
            });
            (plan.thread_groups || []).forEach(function (tg, ti) {
                list.push({
                    plan: plan,
                    planIndex: planIndex,
                    tg: tg,
                    kind: 'thread',
                    label: formatEntryLabel(planName, tg, 'thread')
                });
            });
            (model.post_thread_groups || []).forEach(function (tg, ti) {
                list.push({
                    plan: plan,
                    planIndex: planIndex,
                    tg: tg,
                    kind: 'post',
                    label: formatEntryLabel(planName, tg, 'post')
                });
            });
        });
        return list;
    }

    function summarizeBanner(count, entries) {
        if (!count) return '请先添加测试计划与线程组。';
        var setupN = 0;
        var postN = 0;
        var threadN = 0;
        (entries || []).forEach(function (item) {
            if (item.kind === 'setup') setupN += 1;
            else if (item.kind === 'post') postN += 1;
            else threadN += 1;
        });
        var parts = ['检测到 ' + count + ' 个线程组'];
        var detail = [];
        if (setupN) detail.push('SetUp ' + setupN);
        if (threadN) detail.push('主线程 ' + threadN);
        if (postN) detail.push('tearDown ' + postN);
        if (detail.length) parts.push('（' + detail.join(' · ') + '）');
        parts.push('，分别配置并发与 Influx scenario 标签。');
        return parts.join('');
    }

    function escapeHtml(s) {
        var d = global.document && global.document.createElement ? global.document.createElement('div') : null;
        if (!d) return String(s == null ? '' : s);
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function renderCardHtml(item, esc) {
        if (!item || !item.tg || !item.plan || !item.plan.id) return '';
        var e = typeof esc === 'function' ? esc : escapeHtml;
        var tg = item.tg;
        var kind = item.kind || 'thread';
        var l = tg.load || {};
        return '<section class="jms-vars-plan jms-tg-load-card ' + cardKindClass(kind) + '" data-plan-id="' + e(item.plan.id) + '" data-tg-id="' + e(tg.id) + '" data-tg-kind="' + e(kind) + '">' +
            '<div class="jms-vars-plan__head">' +
            '<span class="jms-vars-plan__badge jms-tg-load-kind-badge ' + badgeKindClass(kind) + '">' + e(kindBadge(kind)) + '</span>' +
            '<span class="jms-tg-load-card__name">' + e(tg.name || '未命名') + '</span>' +
            '</div>' +
            '<div class="jms-tg-load-card__body">' +
            '<div class="jms-tg-load-grid">' +
            '<div class="jms-tg-load-field"><label>users</label><input type="number" class="tg-fld-users" min="1" value="' + e(l.users) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>spawn_rate</label><input type="number" class="tg-fld-spawn" min="1" value="' + e(l.spawn_rate) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>duration_sec</label><input type="number" class="tg-fld-duration" min="1" value="' + e(l.duration_sec) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>loops</label><input type="number" class="tg-fld-loops" value="' + e(l.loops) + '" /></div>' +
            '<div class="jms-tg-load-field jms-tg-load-field--wide"><label>scenario tag</label><input type="text" class="tg-fld-scenario hf-mono" value="' + e(tg.influx_scenario) + '" placeholder="order-create" /></div>' +
            '</div></div></section>';
    }

    function renderCardsHtml(groups, esc) {
        return (groups || []).map(function (item) {
            return renderCardHtml(item, esc);
        }).join('');
    }

    global.JmsTgLoadDrawerUi = {
        collectEntries: collectEntries,
        summarizeBanner: summarizeBanner,
        renderCardHtml: renderCardHtml,
        renderCardsHtml: renderCardsHtml,
        kindBadge: kindBadge
    };
}(typeof window !== 'undefined' ? window : this));
