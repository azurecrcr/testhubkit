/**
 * 线程组 · 监听器统一时间线（隔离模块，供 JmsTgDetailTimeline 挂载）
 */
(function (global) {
    'use strict';

    var KEYS = ['view_results_tree', 'aggregate_report', 'backend_listener'];
    var LABELS = {
        view_results_tree: '查看结果树',
        aggregate_report: '聚合报告',
        backend_listener: '后端监听器'
    };

    function listenersOn(tg) {
        return tg && tg.listeners ? tg.listeners : {};
    }

    function isEnabled(tg, key) {
        var B = global.JmsTgListenerCatalogBridge;
        if (B && typeof B.isListenerEnabled === 'function') {
            return B.isListenerEnabled(tg, key);
        }
        return !!(listenersOn(tg)[key]);
    }

    function ensureConfig(tg, key) {
        if (!tg || !key) return null;
        var B = global.JmsTgListenerCatalogBridge;
        if (B && typeof B.findListenerCatalogStep === 'function') {
            var step = B.findListenerCatalogStep(tg, key, true);
            if (step) return step;
        }
        if (B && typeof B.getListenerConfig === 'function') {
            var cfg = B.getListenerConfig(tg, key);
            if (cfg && typeof cfg === 'object') {
                if (!tg[key] || typeof tg[key] !== 'object') tg[key] = cfg;
                return tg[key];
            }
        }
        if (!tg[key] || typeof tg[key] !== 'object') {
            tg[key] = { name: LABELS[key] || key, enabled: true };
        }
        return tg[key];
    }

    function hasAnyEnabled(tg) {
        var i;
        for (i = 0; i < KEYS.length; i++) {
            if (isEnabled(tg, KEYS[i])) return true;
        }
        return false;
    }

    function forEachEnabledConfig(tg, fn) {
        if (!tg || typeof fn !== 'function') return;
        var i;
        for (i = 0; i < KEYS.length; i++) {
            if (!isEnabled(tg, KEYS[i])) continue;
            fn(ensureConfig(tg, KEYS[i]), KEYS[i]);
        }
    }

    function collectTimelineEntries(tg, entries, getOrderFn) {
        if (!tg || !entries || typeof getOrderFn !== 'function') return;
        var B = global.JmsTgListenerCatalogBridge;
        var i;
        for (i = 0; i < KEYS.length; i++) {
            var key = KEYS[i];
            if (!isEnabled(tg, key)) continue;
            var ref = null;
            if (B && typeof B.findListenerCatalogStep === 'function') {
                ref = B.findListenerCatalogStep(tg, key, true);
            }
            if (!ref) ref = ensureConfig(tg, key);
            entries.push({
                kind: 'listener',
                listenerKey: key,
                ref: ref,
                order: getOrderFn(ref, 'listener', 15000 + i, tg)
            });
        }
    }

    function scanTimelineOrder(tg, scanFn) {
        forEachEnabledConfig(tg, function (ref) {
            if (ref) scanFn(ref);
        });
    }

    function assignAppendTimelineOrder(tg, listenerKey) {
        if (!tg || !listenerKey || !isEnabled(tg, listenerKey)) return;
        var ref = ensureConfig(tg, listenerKey);
        var DT = global.JmsTgDetailTimeline;
        if (DT && typeof DT.assignAppendTimelineOrder === 'function') {
            DT.assignAppendTimelineOrder(tg, ref);
        }
    }

    function disableListener(tg, key) {
        if (!tg) return;
        var B = global.JmsTgListenerCatalogBridge;
        if (B && typeof B.disableListenerCatalog === 'function') {
            B.disableListenerCatalog(tg, key);
            return;
        }
        if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
        tg.listeners[key] = false;
        if (key === 'backend_listener') delete tg.backend_listener;
    }

    function listenerDisplayName(tg, key) {
        var B = global.JmsTgListenerCatalogBridge;
        if (B && typeof B.findListenerCatalogStep === 'function') {
            var step = B.findListenerCatalogStep(tg, key, true);
            if (step && step.name) return step.name;
        }
        var cfg = tg && tg[key] && typeof tg[key] === 'object' ? tg[key] : null;
        if (cfg && cfg.name) return cfg.name;
        return LABELS[key] || key;
    }

    global.JmsTgListenerTimeline = {
        KEYS: KEYS,
        LABELS: LABELS,
        hasAnyEnabled: hasAnyEnabled,
        isEnabled: isEnabled,
        ensureConfig: ensureConfig,
        forEachEnabledConfig: forEachEnabledConfig,
        collectTimelineEntries: collectTimelineEntries,
        scanTimelineOrder: scanTimelineOrder,
        assignAppendTimelineOrder: assignAppendTimelineOrder,
        disableListener: disableListener,
        listenerDisplayName: listenerDisplayName
    };
}(typeof window !== 'undefined' ? window : this));
