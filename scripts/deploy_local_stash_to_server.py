#!/usr/bin/env python3
"""仅将浏览器本地暂存功能补丁应用到服务器 index / load_test / jmeter panel。"""
from pathlib import Path

ROOT = Path("/root/TestHub")
INDEX = ROOT / "templates/index.html"
PANEL = ROOT / "templates/partials/tools/api_scenario_studio_panel.html"
LOAD_HUB = ROOT / "templates/load_test_hub.html"

STASH_SCRIPT = (
    '    <script src="{{ url_for(\'static\', filename=\'js/hf_local_stash.js\') }}?v=20260525"></script>\n'
)


def patch_index_head(text: str) -> str:
    needle = '    <script src="{{ url_for(\'static\', filename=\'js/case_to_mindmap.js\') }}?v=20260612" defer></script>\n'
    if "hf_local_stash.js" in text:
        return text
    if needle not in text:
        raise SystemExit("index head: case_to_mindmap script not found")
    return text.replace(needle, needle + STASH_SCRIPT, 1)


def patch_init_tc_auto_recovery(text: str) -> str:
    old = """                var body = JSON.stringify({ payload: payload });
                if (body.length > 8000000) return;
                var url = '/api/test-case-stashes/auto-recovery';
                try {
                    var blob = new Blob([body], { type: 'application/json' });
                    if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) {
                        return;
                    }
                } catch (e2) { /* ignore */ }
                try {
                    fetch(url, {
                        method: 'POST',
                        keepalive: true,
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: body
                    }).catch(function () {});
                } catch (e3) { /* ignore */ }
            }"""
    new = """                try {
                    if (!window.HfLocalStash || !HfLocalStash.isAvailable) return;
                    HfLocalStash.tc.saveAutoRecovery(payload);
                } catch (e2) { /* ignore */ }
            }"""
    if old not in text:
        if "HfLocalStash.tc.saveAutoRecovery" in text:
            return text
        raise SystemExit("initTcAutoRecovery: API block not found")
    return text.replace(old, new, 1)


def patch_paint_hint(text: str) -> str:
    fn = """
        function paintTcStashStorageHint() {
            if (!window.HfLocalStash) return;
            var html = HfLocalStash.retentionHintHtml();
            var el = document.getElementById('tc-stash-storage-hint');
            if (el) el.innerHTML = html;
            var saveHint = document.getElementById('tc-stash-save-modal-hint');
            if (saveHint) saveHint.innerHTML = html;
        }

"""
    if "function paintTcStashStorageHint" in text:
        return text
    needle = "        function applyTcStashDocument(doc) {"
    if needle not in text:
        raise SystemExit("paintTcStashStorageHint insert point not found")
    return text.replace(needle, fn + needle, 1)


def patch_fetch_tc_stash(text: str) -> str:
    old = """        function fetchTcStashById(sid) {
            return fetch('/api/test-case-stashes/' + encodeURIComponent(sid), { credentials: 'same-origin' })
                .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
                .then(function(_ref) {
                    if (!_ref.ok || _ref.j.error) throw new Error(_ref.j.error || '加载失败');
                    return _ref.j.stash;
                });
        }"""
    new = """        function fetchTcStashById(sid) {
            return Promise.resolve().then(function() {
                if (!window.HfLocalStash || !HfLocalStash.isAvailable) {
                    throw new Error('当前浏览器无法使用本地暂存');
                }
                return HfLocalStash.tc.get(sid);
            });
        }"""
    if old not in text:
        if "HfLocalStash.tc.get(sid)" in text:
            return text
        raise SystemExit("fetchTcStashById not found")
    return text.replace(old, new, 1)


def patch_refresh_tc_stash_list(text: str) -> str:
    old = """            return fetch('/api/test-case-stashes', { credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.error) {
                        renderTcStashList([], typeof data.max === 'number' ? data.max : 10);
                        throw new Error(data.error);
                    }
                    const maxVal = typeof data.max === 'number' ? data.max : 10;
                    renderTcStashList(data.items || [], maxVal);
                    return data;
                });
        }"""
    new = """            if (!window.HfLocalStash || !HfLocalStash.isAvailable) {
                renderTcStashList([], 10);
                return Promise.reject(new Error('当前浏览器无法使用本地暂存'));
            }
            try {
                var data = HfLocalStash.tc.list();
                var maxVal = typeof data.max === 'number' ? data.max : 10;
                renderTcStashList(data.items || [], maxVal);
                return data;
            } catch (err) {
                renderTcStashList([], 10);
                return Promise.reject(err);
            }
        }"""
    if old not in text:
        if "HfLocalStash.tc.list()" in text:
            return text
        raise SystemExit("refreshTcStashList API block not found")
    return text.replace(old, new, 1)


def patch_open_save_modal(text: str) -> str:
    old = """        function openTcStashSaveModal() {
            if (!isTcFeatureUnlocked('stash')) {
                requestTcFeatureUnlock('stash', function() { openTcStashSaveModal(); });
                return;
            }
            const m = document.getElementById('tc-stash-save-modal');
            const inp = document.getElementById('tc-stash-save-title');
            if (inp) inp.value = '';
            showModal(m);"""
    new = """        function openTcStashSaveModal() {
            if (!isTcFeatureUnlocked('stash')) {
                requestTcFeatureUnlock('stash', function() { openTcStashSaveModal(); });
                return;
            }
            paintTcStashStorageHint();
            const m = document.getElementById('tc-stash-save-modal');
            const inp = document.getElementById('tc-stash-save-title');
            if (inp) inp.value = '';
            showModal(m);"""
    if "paintTcStashStorageHint();" in text and "openTcStashSaveModal" in text:
        return text
    if old not in text:
        raise SystemExit("openTcStashSaveModal not found")
    return text.replace(old, new, 1)


def patch_unlock_stash(text: str) -> str:
    old = """                    if (feat === 'stash') {
                        tcAppToast('暂存功能已解锁，可保存与查看列表。', { variant: 'success', duration: 2800 });
                    }"""
    new = """                    if (feat === 'stash') {
                        tcAppToast('暂存功能已解锁，可保存与查看列表。', { variant: 'success', duration: 2800 });
                        paintTcStashStorageHint();
                    }"""
    if "paintTcStashStorageHint();" in text and "feat === 'stash'" in text:
        # may already be patched in unlock
        pass
    elif old in text:
        text = text.replace(old, new, 1)
    return text


def patch_rename_save_delete(text: str) -> str:
    replacements = [
        (
            """                    renameSubmit.disabled = true;
                    fetch('/api/test-case-stashes/' + encodeURIComponent(sid), {
                        method: 'PATCH',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: title })
                    })
                        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
                        .then(function(_ref) {
                            if (!_ref.ok || _ref.j.error) throw new Error(_ref.j.error || '保存失败');
                            closeTcStashRenameModal();
                            return refreshTcStashList();
                        })""",
            """                    renameSubmit.disabled = true;
                    Promise.resolve().then(function() {
                        if (!window.HfLocalStash || !HfLocalStash.isAvailable) throw new Error('当前浏览器无法使用本地暂存');
                        HfLocalStash.tc.updateTitle(sid, title);
                        closeTcStashRenameModal();
                        return refreshTcStashList();
                    })""",
        ),
        (
            """                    saveSubmit.disabled = true;
                    fetch('/api/test-case-stashes', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: title, payload: payload })
                    })
                        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
                        .then(function(_ref) {
                            if (!_ref.ok || _ref.j.error) throw new Error(_ref.j.error || '保存失败');
                            closeTcStashSaveModal();
                            if (saveTitle) saveTitle.value = '';
                            return refreshTcStashList();
                        })
                        .then(function() {
                            tcAppToast('已保存到服务器。可在左侧「暂存列表」中预览或恢复。', { variant: 'success', duration: 3800 });
                        })
                        .catch(function(err) {
                            tcAppAlert(err.message || '网络或服务异常，请稍后重试。', { variant: 'error', title: '保存失败' });
                        })""",
            """                    saveSubmit.disabled = true;
                    Promise.resolve().then(function() {
                        if (!window.HfLocalStash || !HfLocalStash.isAvailable) throw new Error('当前浏览器无法使用本地暂存');
                        HfLocalStash.tc.saveNew(title, payload);
                        closeTcStashSaveModal();
                        if (saveTitle) saveTitle.value = '';
                        return refreshTcStashList();
                    })
                        .then(function() {
                            tcAppToast('已保存到本机浏览器。可在「暂存列表」中预览或恢复。', { variant: 'success', duration: 3800 });
                        })
                        .catch(function(err) {
                            tcAppAlert(err.message || '保存失败，请稍后重试。', { variant: 'error', title: '保存失败' });
                        })""",
        ),
        (
            """                        tcAppConfirm('将从服务器永久删除该暂存文件，且无法恢复。', {
                            title: '删除暂存？',
                            variant: 'warning',
                            confirmText: '删除',
                            cancelText: '保留'
                        }).then(function (okDel) {
                            if (!okDel) return;
                            fetch('/api/test-case-stashes/' + encodeURIComponent(sid), { method: 'DELETE', credentials: 'same-origin' })
                                .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
                                .then(function(_ref3) {
                                    if (!_ref3.ok || _ref3.j.error) throw new Error(_ref3.j.error || '删除失败');
                                    return refreshTcStashList();
                                })
                                .then(function() {
                                    tcAppToast('暂存已从服务器删除。', { variant: 'info', duration: 2800 });
                                })
                                .catch(function(err) {
                                    tcAppAlert(err.message || '删除失败，请稍后重试。', { variant: 'error', title: '删除失败' });
                                });
                        });""",
            """                        tcAppConfirm('将从本机浏览器永久删除该暂存，且无法恢复。', {
                            title: '删除暂存？',
                            variant: 'warning',
                            confirmText: '删除',
                            cancelText: '保留'
                        }).then(function (okDel) {
                            if (!okDel) return;
                            Promise.resolve().then(function() {
                                if (!window.HfLocalStash || !HfLocalStash.isAvailable) throw new Error('当前浏览器无法使用本地暂存');
                                HfLocalStash.tc.remove(sid);
                                return refreshTcStashList();
                            })
                                .then(function() {
                                    tcAppToast('暂存已从浏览器本地删除。', { variant: 'info', duration: 2800 });
                                })
                                .catch(function(err) {
                                    tcAppAlert(err.message || '删除失败，请稍后重试。', { variant: 'error', title: '删除失败' });
                                });
                        });""",
        ),
    ]
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new, 1)
        elif new.split("\n")[1].strip()[:20] not in text:
            pass  # already patched
    return text


def patch_init_stash_ui_paint(text: str) -> str:
    old = """            initBackToTopButton();

            if (openBtn) {"""
    new = """            initBackToTopButton();
            paintTcStashStorageHint();

            if (openBtn) {"""
    if "initBackToTopButton();\n            paintTcStashStorageHint();" in text:
        return text
    if old not in text:
        raise SystemExit("initTestCaseStashUi paint hook not found")
    return text.replace(old, new, 1)


def patch_jmeter_panel(text: str) -> str:
    if "jm-stash-save-btn" in text:
        return text
    action_old = """                <div class="jms-action-bar relative z-30 mt-4">
                    <button type="button" id="btn-validate" class="jms-action-btn">校验配置</button>"""
    action_new = """                <div class="jms-action-bar relative z-30 mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" id="jm-stash-save-btn" class="jms-action-btn jms-action-btn--stash">暂存</button>
                    <button type="button" id="jm-stash-list-btn" class="jms-action-btn jms-action-btn--stash">暂存列表 <span id="jm-stash-count-badge" class="text-indigo-600">0</span>/3</button>
                    <span class="hidden sm:inline-block h-6 w-px bg-slate-200" aria-hidden="true"></span>
                    <button type="button" id="btn-validate" class="jms-action-btn">校验配置</button>"""
    if action_old not in text:
        raise SystemExit("jms-action-bar not found in panel")
    text = text.replace(action_old, action_new, 1)
    hero_old = """        <div class="hf-jmeter-hero mb-4 rounded-xl border border-teal-200/30 px-4 py-3 text-white shadow sm:px-5">"""
    hero_new = """        {% include 'partials/tools/jmeter_stash_ui.html' %}
        <div class="hf-jmeter-hero mb-4 rounded-xl border border-teal-200/30 px-4 py-3 text-white shadow sm:px-5">"""
    if "jmeter_stash_ui.html" not in text:
        if hero_old not in text:
            raise SystemExit("hf-jmeter-hero not found")
        text = text.replace(hero_old, hero_new, 1)
    return text


def patch_load_test_hub(text: str) -> str:
    if "hf_local_stash.js" in text:
        if "hf_jmeter_stash_ui.js" in text:
            return text
    needle = "    {% include 'partials/tools/api_scenario_studio_scripts.html' %}"
    insert = (
        "    <script src=\"{{ url_for('static', filename='js/hf_local_stash.js') }}?v=20260525\"></script>\n"
        "    {% include 'partials/tools/api_scenario_studio_scripts.html' %}\n"
        "    <script src=\"{{ url_for('static', filename='js/hf_jmeter_stash_ui.js') }}?v=20260525\"></script>\n"
    )
    if "hf_jmeter_stash_ui.js" in text:
        return text
    if needle not in text:
        raise SystemExit("load_test_hub scripts include not found")
    return text.replace(needle, insert, 1)


def main() -> None:
    idx = INDEX.read_text(encoding="utf-8")
    idx = patch_index_head(idx)
    idx = patch_init_tc_auto_recovery(idx)
    idx = patch_paint_hint(idx)
    idx = patch_fetch_tc_stash(idx)
    idx = patch_refresh_tc_stash_list(idx)
    idx = patch_open_save_modal(idx)
    idx = patch_unlock_stash(idx)
    idx = patch_rename_save_delete(idx)
    idx = patch_init_stash_ui_paint(idx)
    INDEX.write_text(idx, encoding="utf-8")
    print("index.html: local stash patched")

    panel = PANEL.read_text(encoding="utf-8")
    panel = patch_jmeter_panel(panel)
    PANEL.write_text(panel, encoding="utf-8")
    print("api_scenario_studio_panel.html: jmeter stash UI added")

    lth = LOAD_HUB.read_text(encoding="utf-8")
    lth = patch_load_test_hub(lth)
    LOAD_HUB.write_text(lth, encoding="utf-8")
    print("load_test_hub.html: scripts linked")


if __name__ == "__main__":
    main()
