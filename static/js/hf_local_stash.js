/**
 * 浏览器本地暂存（localStorage 优先；不可用时降级 sessionStorage + 7 天 TTL）
 */
(function (global) {
    'use strict';

    var TTL_MS_7D = 7 * 24 * 60 * 60 * 1000;
    var AUTO_TITLE_PREFIX = '自动保存-';

    function probeStorage(storage) {
        if (!storage) return false;
        try {
            var k = '__hf_stash_probe__';
            storage.setItem(k, '1');
            storage.removeItem(k);
            return true;
        } catch (e) {
            return false;
        }
    }

    var lsOk = probeStorage(global.localStorage);
    var ssOk = !lsOk && probeStorage(global.sessionStorage);

    var retentionMode = lsOk ? 'permanent' : (ssOk ? 'ttl7d' : 'none');

    function retentionHintHtml() {
        var parts = [];
        if (retentionMode === 'permanent') {
            parts.push('暂存保存在本机浏览器中，关闭标签页后仍会保留。');
            parts.push('<strong class="text-amber-800">清理浏览器缓存、网站数据或使用无痕模式会删除全部暂存，请谨慎操作。</strong>');
        } else if (retentionMode === 'ttl7d') {
            parts.push('当前环境无法长期使用本地磁盘存储，暂存仅保存在本次浏览器会话中，<strong class="text-amber-800">最多保留 7 天</strong>，关闭浏览器或清理数据后会丢失。');
        } else {
            parts.push('<strong class="text-red-700">当前浏览器无法使用本地暂存。</strong>');
        }
        return parts.join(' ');
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function autoTitleNow() {
        var d = new Date();
        return AUTO_TITLE_PREFIX + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
            pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    }

    function newId() {
        return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    function countManualItems(items) {
        return (items || []).filter(function (it) { return !it.auto; }).length;
    }

    function createStore(options) {
        var storageKey = options.storageKey;
        var maxItems = options.maxItems || 10;
        var storage = lsOk ? global.localStorage : (ssOk ? global.sessionStorage : null);
        var useTtl = retentionMode === 'ttl7d';

        function readRaw() {
            if (!storage) return { version: 1, items: [] };
            try {
                var raw = storage.getItem(storageKey);
                if (!raw) return { version: 1, items: [] };
                var data = JSON.parse(raw);
                if (!data || !Array.isArray(data.items)) return { version: 1, items: [] };
                return data;
            } catch (e) {
                return { version: 1, items: [] };
            }
        }

        function writeRaw(data) {
            if (!storage) throw new Error('当前浏览器无法写入本地暂存');
            try {
                storage.setItem(storageKey, JSON.stringify(data));
            } catch (e) {
                throw new Error('本地存储空间不足或已被禁用，请删除部分暂存后重试');
            }
        }

        function pruneExpired(items) {
            if (!useTtl) return items;
            var cutoff = Date.now() - TTL_MS_7D;
            return items.filter(function (it) {
                var t = Date.parse(it.updatedAt || it.createdAt || '');
                return Number.isFinite(t) && t >= cutoff;
            });
        }

        function sortItems(items) {
            return items.slice().sort(function (a, b) {
                var ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
                var tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
                return tb - ta;
            });
        }

        function manualItems(items) {
            return items.filter(function (it) { return !it.auto; });
        }

        function autoItems(items) {
            return items.filter(function (it) { return !!it.auto; });
        }

        function list() {
            var data = readRaw();
            var items = pruneExpired(data.items || []);
            data.items = items;
            writeRaw(data);
            items = sortItems(items);
            return {
                items: items.map(function (it) {
                    return {
                        id: it.id,
                        title: it.title,
                        auto: !!it.auto,
                        createdAt: it.createdAt,
                        updatedAt: it.updatedAt
                    };
                }),
                max: maxItems,
                retention: retentionMode
            };
        }

        function get(id) {
            var data = readRaw();
            var items = pruneExpired(data.items || []);
            var found = items.filter(function (it) { return it.id === id; })[0];
            if (!found) throw new Error('暂存不存在或已过期');
            return {
                id: found.id,
                title: found.title,
                payload: found.payload,
                auto: !!found.auto,
                createdAt: found.createdAt,
                updatedAt: found.updatedAt
            };
        }

        function saveNew(title, payload) {
            if (!storage) throw new Error('当前浏览器无法使用本地暂存');
            var data = readRaw();
            var items = pruneExpired(data.items || []);
            if (countManualItems(items) >= maxItems) {
                throw new Error('已达上限（' + maxItems + ' 条），请先删除旧场景后再保存');
            }
            var doc = {
                id: newId(),
                title: String(title || '').trim() || '未命名暂存',
                payload: payload,
                auto: false,
                createdAt: nowIso(),
                updatedAt: nowIso()
            };
            items.push(doc);
            data.items = items;
            writeRaw(data);
            return get(doc.id);
        }

        function updateTitle(id, title) {
            var data = readRaw();
            var items = pruneExpired(data.items || []);
            var idx = -1;
            for (var i = 0; i < items.length; i++) {
                if (items[i].id === id) { idx = i; break; }
            }
            if (idx < 0) throw new Error('暂存不存在');
            items[idx].title = String(title || '').trim();
            if (!items[idx].title) throw new Error('名称不能为空');
            items[idx].updatedAt = nowIso();
            data.items = items;
            writeRaw(data);
            return get(id);
        }

        function remove(id) {
            var data = readRaw();
            var items = pruneExpired(data.items || []);
            var next = items.filter(function (it) { return it.id !== id; });
            if (next.length === items.length) throw new Error('暂存不存在');
            data.items = next;
            writeRaw(data);
        }

        function saveAutoRecovery(payload) {
            if (!storage) return null;
            var data = readRaw();
            var items = pruneExpired(data.items || []);
            var existingIdx = -1;
            for (var i = items.length - 1; i >= 0; i--) {
                var it = items[i];
                if (it && it.auto) {
                    existingIdx = i;
                    break;
                }
            }
            var now = nowIso();
            if (existingIdx >= 0) {
                items[existingIdx].payload = payload;
                items[existingIdx].updatedAt = now;
                items[existingIdx].title = autoTitleNow();
                data.items = items;
                writeRaw(data);
                return get(items[existingIdx].id);
            }
            if (countManualItems(items) >= maxItems) return null;
            var doc = {
                id: newId(),
                title: autoTitleNow(),
                payload: payload,
                auto: true,
                createdAt: now,
                updatedAt: now
            };
            items.push(doc);
            data.items = items;
            writeRaw(data);
            return get(doc.id);
        }

        return {
            list: list,
            get: get,
            saveNew: saveNew,
            updateTitle: updateTitle,
            remove: remove,
            saveAutoRecovery: saveAutoRecovery
        };
    }

    global.HfLocalStash = {
        retentionMode: retentionMode,
        retentionHintHtml: retentionHintHtml,
        isAvailable: retentionMode !== 'none',
        createStore: createStore,
        jmeter: createStore({ storageKey: 'hf_jmeter_stash_v1', maxItems: 10 }),
        uia: createStore({ storageKey: 'hf_uia_stash_v1', maxItems: 3 }),
    };
})(typeof window !== 'undefined' ? window : this);
