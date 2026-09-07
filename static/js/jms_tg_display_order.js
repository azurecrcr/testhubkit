/**
 * 线程组 · UI 显示顺序（隔离模块）
 * 新增线程组按 display_seq 追加到列表末尾，JMX 导出仍按 setup / thread / post 分类。
 */
(function (global) {
    'use strict';

    function isValidSeq(seq) {
        var n = Number(seq);
        return !isNaN(n) && n > 0;
    }

    function flatEntries(model, planId) {
        var list = [];
        if (!model) return list;
        (model.setup_thread_groups || []).forEach(function (tg) {
            list.push({
                key: 'setup:' + tg.id,
                tg: tg,
                planId: planId,
                kind: 'setup',
                isSetup: true,
                isPost: false
            });
        });
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            (plan.thread_groups || []).forEach(function (tg) {
                list.push({
                    key: tg.id,
                    tg: tg,
                    planId: planId,
                    kind: 'thread',
                    isSetup: false,
                    isPost: false
                });
            });
        }
        (model.post_thread_groups || []).forEach(function (tg) {
            list.push({
                key: 'post:' + tg.id,
                tg: tg,
                planId: planId,
                kind: 'post',
                isSetup: false,
                isPost: true
            });
        });
        return list;
    }

    function maxDisplaySeq(entries) {
        var max = 0;
        entries.forEach(function (entry) {
            if (isValidSeq(entry.tg.display_seq)) {
                var n = Number(entry.tg.display_seq);
                if (n > max) max = n;
            }
        });
        return max;
    }

    /** 为缺少 display_seq 的线程组补序号（保留已有 YAML/历史顺序） */
    function ensureDisplaySeq(model, planId) {
        var entries = flatEntries(model, planId);
        var max = maxDisplaySeq(entries);
        entries.forEach(function (entry, index) {
            if (isValidSeq(entry.tg.display_seq)) return;
            max += 1;
            entry.tg.display_seq = max > 0 ? max : (index + 1) * 1000;
        });
        return max;
    }

    function nextDisplaySeq(model, planId) {
        var max = ensureDisplaySeq(model, planId);
        return max + 1;
    }

    function assignOnAdd(model, planId, tg) {
        if (!tg) return;
        tg.display_seq = nextDisplaySeq(model, planId);
    }

    function sortEntries(entries) {
        return entries.slice().sort(function (a, b) {
            var sa = isValidSeq(a.tg.display_seq) ? Number(a.tg.display_seq) : 0;
            var sb = isValidSeq(b.tg.display_seq) ? Number(b.tg.display_seq) : 0;
            if (sa !== sb) return sa - sb;
            return String(a.key).localeCompare(String(b.key));
        });
    }

    function collectInDisplayOrder(model, planId) {
        ensureDisplaySeq(model, planId);
        return sortEntries(flatEntries(model, planId));
    }

    function ensureAllPlans(model) {
        if (!model) return;
        (model.test_plans || []).forEach(function (plan) {
            if (plan && plan.id) ensureDisplaySeq(model, plan.id);
        });
    }

    function applyYamlField(tgOut, tg) {
        if (!tgOut || !tg) return;
        if (isValidSeq(tg.display_seq)) tgOut.display_seq = Number(tg.display_seq);
    }

    function parseFromYaml(tg, out) {
        if (!tg || !out) return out;
        if (isValidSeq(tg.display_seq)) out.display_seq = Number(tg.display_seq);
        return out;
    }

    global.JmsTgDisplayOrder = {
        assignOnAdd: assignOnAdd,
        collectInDisplayOrder: collectInDisplayOrder,
        ensureDisplaySeq: ensureDisplaySeq,
        ensureAllPlans: ensureAllPlans,
        sortEntries: sortEntries,
        applyYamlField: applyYamlField,
        parseFromYaml: parseFromYaml
    };
}(typeof window !== 'undefined' ? window : this));
