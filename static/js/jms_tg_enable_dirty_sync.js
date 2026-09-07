/**
 * 启用/停用切换 · 脏数据同步（隔离模块）
 * 仅同步 YAML，不触发线程组导航全量刷新，避免左侧列表闪烁。
 */
(function (global) {
    'use strict';

    function syncYamlQuiet() {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
     * @param {{ planId?: string, tgId?: string, ifStepId?: string }} opts
     */
    function markEnableToggleDirty(opts) {
        opts = opts || {};
        var planId = opts.planId || '';
        var tgId = opts.tgId || '';
        var ifStepId = opts.ifStepId || '';

        if (ifStepId) {
            var H = global.JmsIfMountSaveHelper;
            if (H && typeof H.markDirty === 'function') {
                H.markDirty(planId, tgId, ifStepId);
                return;
            }
        }

        syncYamlQuiet();
    }

    global.JmsTgEnableDirtySync = {
        syncYamlQuiet: syncYamlQuiet,
        markEnableToggleDirty: markEnableToggleDirty
    };
}(typeof window !== 'undefined' ? window : this));
