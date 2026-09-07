/**
 * 后端监听器导出/YAML 一致性守卫（隔离模块）
 * - 删除或关闭时清除残留的 tg.backend_listener
 * - syncYamlFromModel / beforeValidate 前清理 stale 配置
 */
(function (global) {
    'use strict';

    function sanitizeTgBackendListener(tg) {
        if (!tg) return;
        var B = global.JmsTgListenerCatalogBridge;
        if (B && typeof B.syncLegacyListenerFields === 'function') {
            B.syncLegacyListenerFields(tg);
        }
        var ls = tg.listeners || {};
        if (B && typeof B.hasListenerCatalogStep === 'function' && B.hasListenerCatalogStep(tg, 'backend_listener')) {
            return;
        }
        if (ls.backend_listener !== true) {
            if (tg.listeners) tg.listeners.backend_listener = false;
            delete tg.backend_listener;
        }
    }

    function sanitizeModelBackendListeners(model) {
        if (!model) return;
        function walk(list) {
            (list || []).forEach(sanitizeTgBackendListener);
        }
        walk(model.setup_thread_groups);
        walk(model.post_thread_groups);
        (model.test_plans || []).forEach(function (plan) {
            walk(plan.thread_groups);
        });
    }

    function patchDisableListener() {
        var LT = global.JmsTgListenerTimeline;
        if (!LT || LT.__backendGuardPatched || typeof LT.disableListener !== 'function') return;
        var orig = LT.disableListener;
        LT.disableListener = function (tg, key) {
            orig.call(LT, tg, key);
            if (key === 'backend_listener') delete tg.backend_listener;
        };
        LT.__backendGuardPatched = true;
    }

    function patchSyncYamlFromModel() {
        var vb = global.JmsVisualBuilder;
        if (!vb || vb.__backendYamlGuardPatched || typeof vb.syncYamlFromModel !== 'function') return;
        var orig = vb.syncYamlFromModel;
        vb.syncYamlFromModel = function () {
            if (typeof vb.getModel === 'function') {
                sanitizeModelBackendListeners(vb.getModel());
            }
            return orig.apply(vb, arguments);
        };
        vb.__backendYamlGuardPatched = true;
    }

    function patchBeforeValidate() {
        var vb = global.JmsVisualBuilder;
        if (!vb || vb.__backendPreflightPatched) return;
        var orig = vb.beforeValidate;
        vb.beforeValidate = function () {
            if (typeof vb.getModel === 'function') {
                sanitizeModelBackendListeners(vb.getModel());
            }
            if (typeof orig === 'function') return orig.apply(vb, arguments);
        };
        vb.__backendPreflightPatched = true;
    }

    function tryPatch() {
        patchDisableListener();
        patchSyncYamlFromModel();
        patchBeforeValidate();
        if (global.JmsVisualBuilder && global.JmsVisualBuilder.__backendYamlGuardPatched && global.JmsVisualBuilder.__backendPreflightPatched) return;
        global.setTimeout(tryPatch, 120);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', tryPatch);
    } else {
        tryPatch();
    }
    if (global.addEventListener) global.addEventListener('load', tryPatch);

    global.JmsTgListenerExportGuard = {
        sanitizeTgBackendListener: sanitizeTgBackendListener,
        sanitizeModelBackendListeners: sanitizeModelBackendListeners
    };
}(typeof window !== 'undefined' ? window : this));
