/**
 * JMeter 压测页：账号级「保存 / 我的场景」（服务端按 user_id 隔离）
 * 旁路新实现；不改动 HfLocalStash / UIA 暂存。
 */
(function (global) {
    'use strict';

    var API_BASE = '/api/jmeter-scenario/scenes';
    var SCENE_MAX = 10;

    function msg(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error', placement: 'bottom' });
            return;
        }
        if (ok) console.log(text); else console.warn(text);
    }

    function escapeHtml(t) {
        var d = document.createElement('div');
        d.textContent = t == null ? '' : String(t);
        return d.innerHTML;
    }

    function showModal(el) {
        if (!el) return;
        el.classList.remove('hidden');
        el.classList.add('flex');
    }

    function hideModal(el) {
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('flex');
    }

    function syncYamlFromVisual() {
        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.beforeValidate === 'function') {
            try { global.JmsVisualBuilder.beforeValidate(); } catch (e) { /* ignore */ }
        }
    }

    function collectYamlPayload() {
        var yamlInput = document.getElementById('yaml-input');
        syncYamlFromVisual();
        return { yaml: yamlInput ? String(yamlInput.value || '') : '' };
    }

    function yamlHasContent() {
        return String(collectYamlPayload().yaml || '').trim().length > 0;
    }

    function applyYamlToEditor(yaml) {
        var yamlInput = document.getElementById('yaml-input');
        if (!yamlInput) return;
        yamlInput.value = yaml;
        yamlInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.loadTemplate === 'function') {
            try { global.JmsVisualBuilder.loadTemplate(yaml); } catch (e) { /* ignore */ }
        }
    }

    function clearDirty() {
        try {
            if (global.JmsScenarioStudio && typeof global.JmsScenarioStudio.clearDirtyState === 'function') {
                global.JmsScenarioStudio.clearDirtyState();
            }
        } catch (eClr) { /* ignore */ }
    }

    function apiJson(url, opts) {
        opts = opts || {};
        return fetch(url, {
            method: opts.method || 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
            credentials: 'same-origin',
            body: opts.body != null ? JSON.stringify(opts.body) : undefined
        }).then(function (resp) {
            return resp.json().catch(function () { return {}; }).then(function (body) {
                if (!resp.ok) {
                    var err = new Error((body && (body.error || body.message)) || ('请求失败 (' + resp.status + ')'));
                    err.status = resp.status;
                    err.code = body && body.code;
                    err.body = body;
                    throw err;
                }
                return body;
            });
        });
    }

    var SceneStore = {
        list: function () {
            return apiJson(API_BASE).then(function (data) {
                return { items: data.items || [], count: data.count || 0 };
            });
        },
        get: function (id) {
            return apiJson(API_BASE + '/' + encodeURIComponent(id)).then(function (data) {
                return data.scene || data.item || data;
            });
        },
        saveNew: function (title, payload) {
            return apiJson(API_BASE, {
                method: 'POST',
                body: { title: title, payload: payload }
            }).then(function (data) {
                return data.scene || data.item || data;
            });
        },
        remove: function (id) {
            return apiJson(API_BASE + '/' + encodeURIComponent(id), { method: 'DELETE' });
        }
    };

    global.HfJmeterSceneCloudV1 = SceneStore;

    function rebind(el) {
        if (!el || !el.parentNode) return el;
        var neo = el.cloneNode(true);
        el.parentNode.replaceChild(neo, el);
        return neo;
    }

    function init() {
        if (global.__hfJmeterSceneCloudUiBound) return;
        global.__hfJmeterSceneCloudUiBound = true;
        if (!document.getElementById('jm-stash-save-btn')) return;

        var saveModal = document.getElementById('jm-stash-save-modal');
        var listModal = document.getElementById('jm-stash-list-modal');
        var restoreModal = document.getElementById('jm-stash-restore-modal');
        var saveTitleInp = document.getElementById('jm-stash-save-title');
        var listEl = document.getElementById('jm-stash-list');
        var pendingRestore = null;

        function countBadgeEl() {
            /* 每次取当前 DOM：listBtn 经 rebind 克隆后，旧 badge 节点已脱离文档 */
            return document.getElementById('jm-stash-count-badge');
        }

        function setCountBadge(n) {
            var el = countBadgeEl();
            if (el) el.textContent = String(n) + '/' + SCENE_MAX;
        }

        function refreshListUi() {
            if (!listEl) return Promise.resolve();
            listEl.innerHTML = '<p class="px-3 py-8 text-center text-sm text-slate-400">加载中…</p>';
            return SceneStore.list().then(function (data) {
                var items = data.items || [];
                setCountBadge(items.length);
                if (!items.length) {
                    listEl.innerHTML = '<p class="px-3 py-8 text-center text-sm text-slate-400">暂无已保存场景</p>';
                    return;
                }
                listEl.innerHTML = items.map(function (it) {
                    return (
                        '<div class="jm-scene-list-row">' +
                        '<span class="min-w-0 flex-1 truncate px-2 py-2 text-sm font-medium text-slate-800" title="' +
                        escapeHtml(it.title || '') + '">' + escapeHtml(it.title || '未命名') + '</span>' +
                        '<button type="button" class="jm-stash-restore px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded" data-id="' +
                        escapeHtml(it.id) + '">恢复</button>' +
                        '<button type="button" class="jm-stash-del px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded" data-id="' +
                        escapeHtml(it.id) + '">删除</button>' +
                        '</div>'
                    );
                }).join('');
            }).catch(function (e) {
                if (e && e.status === 401) {
                    listEl.innerHTML = '<p class="px-3 py-4 text-sm text-amber-700">请先登录后再查看「我的场景」</p>';
                    setCountBadge(0);
                    return;
                }
                listEl.innerHTML = '<p class="px-3 py-4 text-sm text-red-600">' + escapeHtml((e && e.message) || '加载失败') + '</p>';
            });
        }

        function applyRestoreDoc(doc) {
            if (!doc || !doc.payload || typeof doc.payload.yaml !== 'string') {
                msg('场景数据无效', false);
                return;
            }
            applyYamlToEditor(doc.payload.yaml);
            hideModal(restoreModal);
            pendingRestore = null;
            clearDirty();
            msg('已恢复「' + (doc.title || '场景') + '」，请校验配置后使用。', true);
        }

        function startRestoreFlow(doc) {
            if (!doc) return;
            if (!yamlHasContent()) {
                applyRestoreDoc(doc);
                return;
            }
            pendingRestore = doc;
            var desc = document.getElementById('jm-stash-restore-desc');
            if (desc) {
                desc.textContent = '将「' + (doc.title || '场景') + '」写回场景（YAML / 可视化），会覆盖当前内容。';
            }
            showModal(restoreModal);
        }

        function closeMoreMenu() {
            var panel = document.getElementById('lth-more-panel');
            var trigger = document.getElementById('lth-more-trigger');
            if (panel) panel.classList.add('hidden');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }

        function onSaveClick() {
            if (!yamlHasContent()) {
                msg('请先搭建场景或填写 YAML 再保存。', false);
                return;
            }
            closeMoreMenu();
            if (saveTitleInp) saveTitleInp.value = '';
            showModal(saveModal);
            setTimeout(function () { if (saveTitleInp) saveTitleInp.focus(); }, 40);
        }

        function onListClick() {
            closeMoreMenu();
            refreshListUi();
            showModal(listModal);
        }

        var saveBtnEl = rebind(document.getElementById('jm-stash-save-btn'));
        var listBtnEl = rebind(document.getElementById('jm-stash-list-btn'));
        if (saveBtnEl) {
            saveBtnEl.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                onSaveClick();
            });
        }
        if (listBtnEl) {
            listBtnEl.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                onListClick();
            });
        }

        var saveCancel = document.getElementById('jm-stash-save-cancel');
        var listClose = document.getElementById('jm-stash-list-close');
        if (saveCancel) saveCancel.addEventListener('click', function () { hideModal(saveModal); });
        if (listClose) listClose.addEventListener('click', function () { hideModal(listModal); });
        if (saveModal) saveModal.addEventListener('click', function (e) { if (e.target === saveModal) hideModal(saveModal); });
        if (listModal) listModal.addEventListener('click', function (e) { if (e.target === listModal) hideModal(listModal); });

        
        if (saveTitleInp && !saveTitleInp.getAttribute('data-enter-save-bound')) {
            saveTitleInp.setAttribute('data-enter-save-bound', '1');
            saveTitleInp.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.keyCode === 13) {
                    ev.preventDefault();
                    var btn = document.getElementById('jm-stash-save-submit');
                    if (btn && !btn.disabled) btn.click();
                }
            });
        }

var saveSubmit = rebind(document.getElementById('jm-stash-save-submit'));
        if (saveSubmit) saveSubmit.addEventListener('click', function () {
            var title = saveTitleInp ? saveTitleInp.value.trim() : '';
            if (!title) {
                msg('请填写场景名称。', false);
                if (saveTitleInp) saveTitleInp.focus();
                return;
            }
            saveSubmit.disabled = true;
            SceneStore.saveNew(title, collectYamlPayload()).then(function () {
                hideModal(saveModal);
                clearDirty();
                refreshListUi();
                msg('已保存到账号「' + title + '」。', true);
            }).catch(function (e) {
                if (e && e.status === 401) {
                    msg('请先登录后再保存场景。', false);
                    return;
                }
                msg((e && e.message) || '保存失败', false);
            }).finally(function () {
                saveSubmit.disabled = false;
            });
        });

        var restoreCancel = document.getElementById('jm-stash-restore-cancel');
        if (restoreCancel) restoreCancel.addEventListener('click', function () {
            pendingRestore = null;
            hideModal(restoreModal);
        });
        var restoreOk = document.getElementById('jm-stash-restore-overwrite');
        if (restoreOk) restoreOk.addEventListener('click', function () {
            if (pendingRestore) applyRestoreDoc(pendingRestore);
        });
        if (restoreModal) restoreModal.addEventListener('click', function (e) {
            if (e.target === restoreModal) {
                pendingRestore = null;
                hideModal(restoreModal);
            }
        });

        if (listEl) {
            listEl.addEventListener('click', function (e) {
                var res = e.target.closest('.jm-stash-restore');
                var del = e.target.closest('.jm-stash-del');
                if (res && res.getAttribute('data-id')) {
                    SceneStore.get(res.getAttribute('data-id')).then(function (doc) {
                        hideModal(listModal);
                        startRestoreFlow(doc);
                    }).catch(function (err) {
                        msg((err && err.message) || '加载失败', false);
                    });
                    return;
                }
                if (del && del.getAttribute('data-id')) {
                    var sid = del.getAttribute('data-id');
                    if (!global.confirm('确定删除该场景？')) return;
                    SceneStore.remove(sid).then(function () {
                        refreshListUi();
                        msg('已删除。', true);
                    }).catch(function (err) {
                        msg((err && err.message) || '删除失败', false);
                    });
                }
            });
        }

        refreshListUi();
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        global.addEventListener('load', init);
    }
})(typeof window !== 'undefined' ? window : this);
