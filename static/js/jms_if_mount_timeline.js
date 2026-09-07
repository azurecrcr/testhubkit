/**
 * If 控制器挂载区 · 统一时间线（隔离模块，不影响 TG/HTTP 挂载 timeline）
 */
(function (global) {
    'use strict';

    function assertLabel(type) {
        if (type === 'response' || type === 'response_assert') return '响应断言';
        if (type === 'json' || type === 'json_assert') return 'JSON断言';
        if (type === 'size' || type === 'size_assert') return '大小断言';
        if (type === 'md5hex' || type === 'md5hex_assert') return 'MD5Hex断言';
        return type || '断言';
    }

    function configLabel(type) {
        var cat = global.JmsTgConfigCatalog;
        if (cat && cat.LABELS && cat.LABELS[type]) return cat.LABELS[type];
        return type || '配置元件';
    }

    function truncate(s, n) {
        s = String(s || '');
        return s.length <= n ? s : s.slice(0, n) + '…';
    }

    function isLogicMountHost(ifStep) {
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isLogicMountHost === 'function') {
            return global.JmsIfMountModel.isLogicMountHost(ifStep);
        }
        return !!(ifStep && (ifStep.type === 'if_controller' || ifStep.type === 'random_controller' || ifStep.type === 'simple_controller' || ifStep.type === 'transaction_controller' || ifStep.type === 'loop_controller'));
    }

    function keys(ifStep) {
        return Array.isArray(ifStep && ifStep.mount_timeline_keys) ? ifStep.mount_timeline_keys : [];
    }

    function buildSlotOnlyEntries(ifStep, orderStart) {
        orderStart = orderStart || 0;
        var entries = [];
        var order = orderStart;
        var ifId = ifStep.id;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isUserParametersVisible === 'function'
            ? global.JmsIfMountModel.isUserParametersVisible(ifStep)
            : (ifStep.user_parameters && ifStep.user_parameters.enabled !== false)) {
            entries.push({
                kind: 'user_parameters', mountKind: 'user_parameters', mountIndex: 0, ifStepId: ifId,
                key: 'ifpre:user_parameters', defaultOrder: order++,
                icon: 'UP', typeLabel: '前置', name: '用户参数', meta: '',
                cardClass: 'jms-aux-card--preproc',
                disabled: ifStep.user_parameters.enabled === false
            });
        }
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isConstantTimerVisible === 'function'
            ? global.JmsIfMountModel.isConstantTimerVisible(ifStep)
            : (ifStep.constant_timer && ifStep.constant_timer.enabled !== false)) {
            var t = ifStep.constant_timer;
            entries.push({
                kind: 'timer', mountKind: 'timer', mountIndex: 0, ifStepId: ifId,
                key: 'iftimer:constant', defaultOrder: order++,
                icon: 'T', typeLabel: '定时器', name: t.name || '固定定时器',
                meta: (t.delay_ms != null ? t.delay_ms + 'ms' : ''), cardClass: 'jms-aux-card--timer',
                disabled: t.enabled === false
            });
        }
        return entries;
    }

    function buildDefaultEntries(ifStep) {
        var B = global.JmsMountCatalogBridge;
        if (B && typeof B.buildHashMountEntries === 'function') {
            if (typeof B.migrateLegacyMountArraysToHash === 'function') {
                B.migrateLegacyMountArraysToHash(ifStep);
            }
            var hashEntries = B.buildHashMountEntries(ifStep);
            if (hashEntries.length || (typeof B.usesHashForArrayMounts === 'function' && B.usesHashForArrayMounts(ifStep))) {
                var slotOnly = buildSlotOnlyEntries(ifStep, hashEntries.length);
                return hashEntries.concat(slotOnly);
            }
        }
        var entries = [];
        var order = 0;
        var ifId = ifStep.id;

        (ifStep.processors || []).forEach(function (p, i) {
            if (!p) return;
            var hint = '';
            if (p.type === 'json_post' && p.var) hint = p.var;
            if (p.type === 'regex_extract' && p.refname) hint = p.refname;
            entries.push({
                kind: 'processor', mountKind: 'processor', mountIndex: i, ifStepId: ifId,
                key: 'ifproc:' + i, defaultOrder: order++,
                icon: 'P', typeLabel: '后置', name: p.name || ('处理器 ' + (i + 1)), meta: hint || p.type,
                cardClass: 'jms-aux-card--json',
                disabled: p.enabled === false
            });
        });

        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isUserParametersVisible === 'function'
            ? global.JmsIfMountModel.isUserParametersVisible(ifStep)
            : (ifStep.user_parameters && ifStep.user_parameters.enabled !== false)) {
            entries.push({
                kind: 'user_parameters', mountKind: 'user_parameters', mountIndex: 0, ifStepId: ifId,
                key: 'ifpre:user_parameters', defaultOrder: order++,
                icon: 'UP', typeLabel: '前置', name: '用户参数', meta: '',
                cardClass: 'jms-aux-card--preproc',
                disabled: ifStep.user_parameters.enabled === false
            });
        }

        (ifStep.pre_processors || []).forEach(function (p, i) {
            if (!p) return;
            entries.push({
                kind: 'pre_processor', mountKind: 'pre_processor', mountIndex: i, ifStepId: ifId,
                key: 'ifpre:' + i, defaultOrder: order++,
                icon: 'BS', typeLabel: '前置', name: p.name || ('PreProcessor ' + (i + 1)),
                meta: truncate(p.script, 32), cardClass: 'jms-aux-card--beanshell',
                disabled: p.enabled === false
            });
        });

        (ifStep.assertions || []).forEach(function (a, i) {
            if (!a) return;
            entries.push({
                kind: 'assertion', mountKind: 'assertion', mountIndex: i, ifStepId: ifId,
                key: 'ifas:' + i, defaultOrder: order++,
                icon: 'A', typeLabel: '断言', name: a.name || assertLabel(a.type), meta: a.type,
                cardClass: 'jms-aux-card--assert'
            });
        });

        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isConstantTimerVisible === 'function'
            ? global.JmsIfMountModel.isConstantTimerVisible(ifStep)
            : (ifStep.constant_timer && ifStep.constant_timer.enabled !== false)) {
            var t = ifStep.constant_timer;
            entries.push({
                kind: 'timer', mountKind: 'timer', mountIndex: 0, ifStepId: ifId,
                key: 'iftimer:constant', defaultOrder: order++,
                icon: 'T', typeLabel: '定时器', name: t.name || '固定定时器',
                meta: (t.delay_ms != null ? t.delay_ms + 'ms' : ''), cardClass: 'jms-aux-card--timer',
                disabled: t.enabled === false
            });
        }

        (ifStep.http_managers || []).forEach(function (c, i) {
            if (!c) return;
            var cfgCardClass = 'jms-aux-card--config';
            if (c.type === 'counter') cfgCardClass += ' jms-aux-card--http-mount-config-counter';
            entries.push({
                kind: 'config', mountKind: 'config', mountIndex: i, ifStepId: ifId,
                key: 'ifcfg:' + i, defaultOrder: order++,
                icon: 'C', typeLabel: '配置', name: c.name || configLabel(c.type), meta: c.type,
                cardClass: cfgCardClass,
                disabled: c.enabled === false
            });
        });

        var sl = ifStep.step_listeners || {};
        [['view_results_tree', '察看结果树'], ['aggregate_report', '聚合报告'], ['backend_listener', '后端监听器']].forEach(function (pair, i) {
            if (!sl[pair[0]]) return;
            entries.push({
                kind: 'listener', mountKind: 'listener', mountIndex: i, mountListenerKey: pair[0], ifStepId: ifId,
                key: 'iflis:' + pair[0], defaultOrder: order++,
                icon: 'L', typeLabel: '监听器', name: pair[1], meta: '',
                cardClass: 'jms-aux-card--listener',
                disabled: (function(){ var lc=ifStep[pair[0]]; return lc&&typeof lc==='object'&&lc.enabled===false; })()
            });
        });

        return entries;
    }

    function sortEntriesByKeys(entries, keyList) {
        if (!keyList || !keyList.length) {
            entries.sort(function (a, b) { return a.defaultOrder - b.defaultOrder; });
            return entries;
        }
        var rank = {};
        keyList.forEach(function (k, i) { rank[k] = i; });
        entries.sort(function (a, b) {
            var ra = rank[a.key];
            var rb = rank[b.key];
            if (ra == null && rb == null) return a.defaultOrder - b.defaultOrder;
            if (ra == null) return 1;
            if (rb == null) return -1;
            return ra - rb;
        });
        return entries;
    }


    function keyChild(stepId) { return 'ifchild:' + stepId; }

    function ensureBodyTimelineKeys(ifStep) {
        if (!ifStep || !isLogicMountHost(ifStep)) return;
        if (!Array.isArray(ifStep.mount_timeline_keys)) ifStep.mount_timeline_keys = [];
        if (ifStep.mount_timeline_keys.length) return;
        var ordered = [];
        buildDefaultEntries(ifStep).forEach(function (e) { ordered.push(e.key); });
        (ifStep.children || []).forEach(function (c) {
            if (c && c.id) ordered.push(keyChild(c.id));
        });
        if (ordered.length) ifStep.mount_timeline_keys = ordered;
    }

    function buildBodyRenderPlan(ifStep) {
        if (!ifStep || !isLogicMountHost(ifStep)) return [];
        ensureBodyTimelineKeys(ifStep);
        var mountEntries = buildDefaultEntries(ifStep);
        var mountByKey = {};
        mountEntries.forEach(function (e) { mountByKey[e.key] = e; });
        var childByKey = {};
        (ifStep.children || []).forEach(function (c) {
            if (c && c.id) childByKey[keyChild(c.id)] = c;
        });
        var plan = [];
        var seenMount = {};
        var seenChild = {};
        keys(ifStep).forEach(function (key) {
            if (key.indexOf('ifchild:') === 0) {
                var ch = childByKey[key];
                if (ch) {
                    plan.push({ kind: 'child', step: ch, key: key });
                    seenChild[key] = true;
                }
            } else if (mountByKey[key]) {
                plan.push({ kind: 'mount', entry: mountByKey[key], key: key });
                seenMount[key] = true;
            }
        });
        mountEntries.forEach(function (e) {
            if (!seenMount[e.key]) plan.push({ kind: 'mount', entry: e, key: e.key });
        });
        (ifStep.children || []).forEach(function (c) {
            if (!c || !c.id) return;
            var ck = keyChild(c.id);
            if (!seenChild[ck]) plan.push({ kind: 'child', step: c, key: ck });
        });
        return plan;
    }


    function syncChildrenOrderFromKeys(ifStep, keyList) {
        if (!ifStep || !Array.isArray(ifStep.children)) return;
        var childKeys = (keyList || []).filter(function (k) { return k.indexOf('ifchild:') === 0; });
        var idOrder = childKeys.map(function (k) { return k.slice(8); });
        var byId = {};
        (ifStep.children || []).forEach(function (c) {
            if (c && c.id) byId[c.id] = c;
        });
        var reordered = [];
        idOrder.forEach(function (id) {
            if (byId[id]) {
                reordered.push(byId[id]);
                delete byId[id];
            }
        });
        Object.keys(byId).forEach(function (id) { reordered.push(byId[id]); });
        ifStep.children = reordered;
    }

    function buildBodyKeyList(ifStep) {
        return buildBodyRenderPlan(ifStep).map(function (p) { return p.key; });
    }

    function reorderBodyKeys(ifStep, fromIndex, toIndex) {
        if (!ifStep || !isLogicMountHost(ifStep) || fromIndex === toIndex) return false;
        ensureBodyTimelineKeys(ifStep);
        var keyList = buildBodyKeyList(ifStep);
        if (fromIndex < 0 || fromIndex >= keyList.length) return false;
        toIndex = Math.max(0, Math.min(toIndex, keyList.length - 1));
        if (fromIndex === toIndex) return true;
        var moved = keyList.splice(fromIndex, 1)[0];
        keyList.splice(toIndex, 0, moved);
        ifStep.mount_timeline_keys = keyList;
        syncChildrenOrderFromKeys(ifStep, keyList);
        return true;
    }

    function ensureMountTimelineKeys(ifStep) {
        ensureBodyTimelineKeys(ifStep);
    }

    function buildMountEntries(ifStep) {
        if (!ifStep || !isLogicMountHost(ifStep)) return [];
        ensureMountTimelineKeys(ifStep);
        var entries = buildDefaultEntries(ifStep);
        return sortEntriesByKeys(entries, keys(ifStep));
    }

    function assignAppendMountKey(ifStep, key) {
        if (!ifStep || !key) return;
        if (!Array.isArray(ifStep.mount_timeline_keys)) ifStep.mount_timeline_keys = [];
        if (ifStep.mount_timeline_keys.indexOf(key) < 0) {
            ifStep.mount_timeline_keys.push(key);
        }
    }


    function mountKeyPrefix(k) {
        if (k.indexOf("ifhash:") === 0) return "ifhash";
        if (k === "ifpre:user_parameters") return "ifpre:user_parameters";
        if (k.indexOf("ifpre:") === 0) return "ifpre";
        if (k.indexOf("ifas:") === 0) return "ifas";
        if (k.indexOf("ifcfg:") === 0) return "ifcfg";
        if (k.indexOf("ifproc:") === 0) return "ifproc";
        if (k.indexOf("iflis:") === 0) return "iflis";
        if (k.indexOf("iftimer:") === 0) return "iftimer";
        return "other";
    }

    function freshKeysForPrefix(freshEntries, prefix) {
        return freshEntries.filter(function (e) {
            return mountKeyPrefix(e.key) === prefix;
        }).map(function (e) { return e.key; });
    }

    function removeMountKeyFromTimeline(ifStep, key) {
        if (!ifStep || !key || !Array.isArray(ifStep.mount_timeline_keys)) return;
        var idx = ifStep.mount_timeline_keys.indexOf(key);
        if (idx >= 0) ifStep.mount_timeline_keys.splice(idx, 1);
    }

    function reconcileMountKeysAfterDelete(ifStep) {
        if (!ifStep) return;
        var oldKeys = ifStep.mount_timeline_keys || [];
        var childKeys = [];
        var oldMountKeys = [];
        oldKeys.forEach(function (k) {
            if (k.indexOf("ifchild:") === 0) childKeys.push(k);
            else oldMountKeys.push(k);
        });
        var freshEntries = buildDefaultEntries(ifStep);
        var freshByKey = {};
        freshEntries.forEach(function (e) { freshByKey[e.key] = e; });
        var usedFresh = {};
        var newMountKeys = [];
        oldMountKeys.forEach(function (oldKey) {
            if (freshByKey[oldKey]) {
                newMountKeys.push(oldKey);
                usedFresh[oldKey] = true;
                return;
            }
            var prefix = mountKeyPrefix(oldKey);
            if (prefix === "ifhash" || prefix === "ifpre" || prefix === "ifas" || prefix === "ifcfg" || prefix === "ifproc") {
                var pool = freshKeysForPrefix(freshEntries, prefix);
                var oldSamePrefix = oldMountKeys.filter(function (k) { return mountKeyPrefix(k) === prefix; });
                var pos = oldSamePrefix.indexOf(oldKey);
                if (pos >= 0 && pos < pool.length) {
                    var candidate = pool[pos];
                    if (candidate && !usedFresh[candidate] && freshByKey[candidate]) {
                        newMountKeys.push(candidate);
                        usedFresh[candidate] = true;
                    }
                }
            }
        });
        freshEntries.forEach(function (e) {
            if (!usedFresh[e.key]) {
                newMountKeys.push(e.key);
                usedFresh[e.key] = true;
            }
        });
        ifStep.mount_timeline_keys = newMountKeys.concat(childKeys);
    }

    function keyProcessor(index) { return 'ifproc:' + index; }
    function keyPreProcessor(index) { return 'ifpre:' + index; }
    function keyUserParameters() { return 'ifpre:user_parameters'; }
    function keyAssertion(index) { return 'ifas:' + index; }
    function keyTimer() { return 'iftimer:constant'; }
    function keyConfig(index) { return 'ifcfg:' + index; }
    function keyListener(listenerKey) { return 'iflis:' + listenerKey; }

    global.JmsIfMountTimeline = {
        buildMountEntries: buildMountEntries,
        buildBodyRenderPlan: buildBodyRenderPlan,
        ensureBodyTimelineKeys: ensureBodyTimelineKeys,
        ensureMountTimelineKeys: ensureMountTimelineKeys,
        keyChild: keyChild,
        assignAppendMountKey: assignAppendMountKey,
        keyProcessor: keyProcessor,
        keyPreProcessor: keyPreProcessor,
        keyUserParameters: keyUserParameters,
        keyAssertion: keyAssertion,
        keyTimer: keyTimer,
        keyConfig: keyConfig,
        keyListener: keyListener,
        reorderBodyKeys: reorderBodyKeys,
        buildBodyKeyList: buildBodyKeyList,
        removeMountKeyFromTimeline: removeMountKeyFromTimeline,
        reconcileMountKeysAfterDelete: reconcileMountKeysAfterDelete
    };
}(typeof window !== 'undefined' ? window : this));
