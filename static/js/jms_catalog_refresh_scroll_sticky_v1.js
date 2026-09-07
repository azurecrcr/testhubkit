/**
 * catalog 添加后 · 步骤区滚动位置保持（隔离补丁 v2）
 * - 延长重试窗口，覆盖 applyIfCollapseState / CardToggle.applyState 后的布局抖动
 * - 增强 JmsTgTreeScrollPreserve.restore，避免新 DOM 未撑开时 scrollTop 写入失败
 */
(function (global) {
    'use strict';

    function sid(v) {
        return v == null ? '' : String(v);
    }

    function findPlanCard(planId) {
        if (!planId) return null;
        return global.document.querySelector('.jms-plan-card[data-plan-id="' + sid(planId) + '"]');
    }

    function capture(planId) {
        var SP = global.JmsTgTreeScrollPreserve;
        var card = findPlanCard(planId);
        if (!SP || !SP.capture || !card) return null;
        return SP.capture(card);
    }

    function restore(planId, snap) {
        if (!snap) return;
        var SP = global.JmsTgTreeScrollPreserve;
        var card = findPlanCard(planId);
        if (!SP || !SP.restore || !card) return;
        SP.restore(card, snap);
    }

    function forceStepsScroll(card, snap) {
        if (!card || !snap) return false;
        var steps = card.querySelector('.jms-tg-tree-steps');
        if (!steps) return false;
        var target = snap.stepsTop || 0;
        if (target <= 0) return true;
        var max = Math.max(0, steps.scrollHeight - steps.clientHeight);
        var next = Math.min(target, max);
        if (steps.scrollTop !== next) steps.scrollTop = next;
        return Math.abs(steps.scrollTop - target) <= 2 || steps.scrollTop >= next;
    }

    function restoreWithRetries(planId, snap, times, delayMs) {
        if (!snap || !planId) return;
        var card = findPlanCard(planId);
        var left = times || 0;
        function tick() {
            restore(planId, snap);
            if (card) forceStepsScroll(card, snap);
            if (left > 0) {
                left -= 1;
                global.setTimeout(tick, delayMs || 48);
            }
        }
        tick();
    }

    function scheduleLongRestore(planId, snap) {
        if (!snap || !planId) return;
        var delays = [0, 16, 48, 80, 120, 160, 220, 300];
        delays.forEach(function (ms) {
            global.setTimeout(function () {
                restoreWithRetries(planId, snap, 1, 0);
            }, ms);
        });
    }

    function patchScrollPreserve() {
        var SP = global.JmsTgTreeScrollPreserve;
        if (!SP || SP.__scrollStickyV2) return;
        SP.__scrollStickyV2 = true;
        var orig = SP.restore;
        SP.restore = function (card, snap) {
            if (!snap || !card) return;
            forceStepsScroll(card, snap);
            if (typeof orig === 'function') orig(card, snap);
            global.setTimeout(function () { forceStepsScroll(card, snap); }, 0);
            global.setTimeout(function () { forceStepsScroll(card, snap); }, 60);
            global.setTimeout(function () { forceStepsScroll(card, snap); }, 120);
        };
    }

    function patchCatalogRefresh() {
        var CR = global.JmsCatalogRefresh;
        if (!CR || CR.__scrollStickyV2) return;
        CR.__scrollStickyV2 = true;
        var orig = CR.refreshStepsArea;
        CR.refreshStepsArea = function (vb, planId, tgId, insertCtx) {
            var snap = capture(planId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            scheduleLongRestore(planId, snap);
        };
    }

    function patchCatalogPostAdd() {
        var PA = global.JmsCatalogPostAdd;
        if (!PA || PA.__scrollStickyV2) return;
        PA.__scrollStickyV2 = true;
        var orig = PA.refreshAfterSave;
        PA.refreshAfterSave = function (vb, planId, tgId, step, insertCtx) {
            var snap = capture(planId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            scheduleLongRestore(planId, snap);
        };
    }

    function patchCatalogCardToggle() {
        var CT = global.JmsCatalogCardToggle;
        if (!CT || CT.__scrollStickyV2) return;
        CT.__scrollStickyV2 = true;
        var orig = CT.applyState;
        CT.applyState = function (planCard) {
            var planId = planCard && planCard.getAttribute('data-plan-id');
            var snap = capture(planId);
            if (typeof orig === 'function') orig.apply(this, arguments);
            scheduleLongRestore(planId, snap);
        };
    }

    function patchTreeShellRefresh() {
        var SH = global.JmsTgTreeShell;
        if (!SH || SH.__scrollStickyV2 || typeof SH.refreshTgDetailByTgId !== 'function') return;
        SH.__scrollStickyV2 = true;
        var orig = SH.refreshTgDetailByTgId;
        SH.refreshTgDetailByTgId = function (planId, tgId) {
            var snap = capture(planId);
            var ok = orig.apply(this, arguments);
            if (ok) scheduleLongRestore(planId, snap);
            return ok;
        };
    }

    function bind() {
        patchScrollPreserve();
        patchCatalogRefresh();
        patchCatalogPostAdd();
        patchCatalogCardToggle();
        patchTreeShellRefresh();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsCatalogRefreshScrollSticky = {
        capture: capture,
        restoreWithRetries: restoreWithRetries,
        scheduleLongRestore: scheduleLongRestore
    };
})(window);
