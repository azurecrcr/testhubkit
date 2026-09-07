#!/usr/bin/env python3
"""Patch TestHub server: float panel size persist, stash btn, remove yellow hint."""
from pathlib import Path

ROOT = Path("/root/TestHub")
INDEX = ROOT / "templates/index.html"
MAIN = ROOT / "templates/partials/tools/test_case_main.html"
CSS = ROOT / "static/css/toolkit.css"


def patch_main(text: str) -> str:
    old = (
        '                                <div id="tc-stash-storage-hint" '
        'class="flex-shrink-0 border-b border-amber-100 bg-amber-50/90 '
        'px-3 py-2 text-xs text-amber-900/90 leading-snug"></div>\n'
    )
    if old in text:
        text = text.replace(old, "", 1)
        print("removed tc-stash-storage-hint from test_case_main.html")
    elif "tc-stash-storage-hint" not in text:
        print("tc-stash-storage-hint already removed")
    else:
        raise SystemExit("tc-stash-storage-hint block mismatch")
    return text


def patch_css(text: str) -> str:
    needle = "        #tc-stash-list .tc-stash-row {"
    block = """        /* 暂存悬浮区挂 body：保证 FAB 可点击 */
        .tc-stash-float-root {
            position: fixed;
            z-index: 55;
            pointer-events: none;
        }
        #tc-stash-float-root #tc-stash-rail-float-wrap,
        #tc-stash-float-root #tc-stash-rail-col {
            pointer-events: auto;
        }
        #tc-stash-open-btn {
            cursor: pointer;
            touch-action: manipulation;
        }

"""
    if ".tc-stash-float-root {" in text:
        print("tc-stash-float-root css already present")
    elif needle not in text:
        raise SystemExit("css anchor not found")
    else:
        text = text.replace(needle, block + needle, 1)
        print("added tc-stash-float-root css")
    return text


def patch_index(text: str) -> str:
    # --- float layout localStorage ---
    anchor = "        var TC_LEFT_FLOAT_DEFAULT_H = 560;\n"
    insert = """        var TC_LEFT_FLOAT_DEFAULT_H = 560;
        var TC_LEFT_FLOAT_LAYOUT_KEY = 'tc_left_float_layout_v1';

        function loadTcLeftFloatLayoutFromStorage() {
            try {
                var raw = localStorage.getItem(TC_LEFT_FLOAT_LAYOUT_KEY);
                if (!raw) return;
                var d = JSON.parse(raw);
                if (d && typeof d.w === 'number' && typeof d.h === 'number') {
                    tcLeftFloatSessionSize = { w: d.w, h: d.h };
                }
                if (d && typeof d.x === 'number' && typeof d.y === 'number') {
                    tcLeftFloatSessionPos = { x: d.x, y: d.y };
                }
            } catch (e) { /* ignore */ }
        }

        function persistTcLeftFloatLayout() {
            var panel = document.getElementById('left-panel');
            if (!panel) return;
            var r = panel.getBoundingClientRect();
            var payload = {
                w: Math.round(r.width),
                h: Math.round(r.height),
                x: Math.round(r.left),
                y: Math.round(r.top)
            };
            tcLeftFloatSessionSize = { w: payload.w, h: payload.h };
            tcLeftFloatSessionPos = { x: payload.x, y: payload.y };
            try {
                localStorage.setItem(TC_LEFT_FLOAT_LAYOUT_KEY, JSON.stringify(payload));
            } catch (e) { /* ignore */ }
        }

"""
    if "TC_LEFT_FLOAT_LAYOUT_KEY" not in text:
        if anchor not in text:
            raise SystemExit("float default H anchor missing")
        text = text.replace(anchor, insert, 1)
        print("inserted float layout storage helpers")

    old_ensure_size = """        function ensureTcLeftFloatSize() {
            var panel = document.getElementById('left-panel');
            if (!panel) return;
            if (tcLeftFloatSessionSize && typeof tcLeftFloatSessionSize.w === 'number' && typeof tcLeftFloatSessionSize.h === 'number') {
                applyTcLeftFloatSize(tcLeftFloatSessionSize.w, tcLeftFloatSessionSize.h);
                return;
            }
            var def = measureTcLeftFloatDefaultSize();
            applyTcLeftFloatSize(def.w, def.h);
        }"""

    new_ensure_size = """        function ensureTcLeftFloatSize() {
            var panel = document.getElementById('left-panel');
            if (!panel) return;
            loadTcLeftFloatLayoutFromStorage();
            if (tcLeftFloatSessionSize && typeof tcLeftFloatSessionSize.w === 'number' && typeof tcLeftFloatSessionSize.h === 'number') {
                applyTcLeftFloatSize(tcLeftFloatSessionSize.w, tcLeftFloatSessionSize.h);
                return;
            }
            applyTcLeftFloatSize(TC_LEFT_FLOAT_DEFAULT_W, TC_LEFT_FLOAT_DEFAULT_H);
        }"""

    if old_ensure_size in text:
        text = text.replace(old_ensure_size, new_ensure_size, 1)
        print("patched ensureTcLeftFloatSize")

    old_ensure_pos = """        function ensureTcLeftFloatPosition() {
            var panel = document.getElementById('left-panel');
            if (!panel) return;
            if (tcLeftFloatSessionPos && typeof tcLeftFloatSessionPos.x === 'number' && typeof tcLeftFloatSessionPos.y === 'number') {
                applyTcLeftFloatPosition(tcLeftFloatSessionPos.x, tcLeftFloatSessionPos.y);
                return;
            }
            var def = getTcLeftFloatDefaultPos();
            applyTcLeftFloatPosition(def.x, def.y);
        }"""

    new_ensure_pos = """        function ensureTcLeftFloatPosition() {
            var panel = document.getElementById('left-panel');
            if (!panel) return;
            loadTcLeftFloatLayoutFromStorage();
            if (tcLeftFloatSessionPos && typeof tcLeftFloatSessionPos.x === 'number' && typeof tcLeftFloatSessionPos.y === 'number') {
                applyTcLeftFloatPosition(tcLeftFloatSessionPos.x, tcLeftFloatSessionPos.y);
                return;
            }
            var def = getTcLeftFloatDefaultPos();
            applyTcLeftFloatPosition(def.x, def.y);
        }"""

    if old_ensure_pos in text:
        text = text.replace(old_ensure_pos, new_ensure_pos, 1)
        print("patched ensureTcLeftFloatPosition")

    old_save_size = """        function saveTcLeftFloatSize() {
            var panel = document.getElementById('left-panel');
            if (!panel) return;
            var r = panel.getBoundingClientRect();
            tcLeftFloatSessionSize = { w: Math.round(r.width), h: Math.round(r.height) };
        }"""

    new_save_size = """        function saveTcLeftFloatSize() {
            persistTcLeftFloatLayout();
        }"""

    if old_save_size in text:
        text = text.replace(old_save_size, new_save_size, 1)
        print("patched saveTcLeftFloatSize")

    old_save_pos = """        function saveTcLeftFloatPosition() {
            var panel = document.getElementById('left-panel');
            if (!panel) return;
            var r = panel.getBoundingClientRect();
            tcLeftFloatSessionPos = { x: Math.round(r.left), y: Math.round(r.top) };
        }"""

    new_save_pos = """        function saveTcLeftFloatPosition() {
            persistTcLeftFloatLayout();
        }"""

    if old_save_pos in text:
        text = text.replace(old_save_pos, new_save_pos, 1)
        print("patched saveTcLeftFloatPosition")

    if "            resetTcLeftFloatSessionLayout();\n" in text:
        text = text.replace("            resetTcLeftFloatSessionLayout();\n", "", 1)
        print("removed resetTcLeftFloatSessionLayout on init")

    # --- paintTcStashStorageHint: no list yellow bar (tc only) ---
    old_paint_scoped = """        function paintTcStashStorageHint(scope) {
            if (!window.HfLocalStash) return;
            var html = HfLocalStash.retentionHintHtml();
            scope = scope || 'all';
            if (scope === 'all' || scope === 'save') {
                var saveHint = document.getElementById('tc-stash-save-modal-hint');
                if (saveHint) saveHint.innerHTML = html;
            }
            if (scope === 'all' || scope === 'list') {
                var listHint = document.getElementById('tc-stash-storage-hint');
                var split = document.getElementById('tc-stash-split');
                var railOpen = split && !split.classList.contains('tc-stash-rail--collapsed');
                if (listHint) listHint.innerHTML = railOpen ? html : '';
            }
        }"""

    old_paint_simple = """        function paintTcStashStorageHint() {
            if (!window.HfLocalStash) return;
            var html = HfLocalStash.retentionHintHtml();
            var el = document.getElementById('tc-stash-storage-hint');
            if (el) el.innerHTML = html;
            var saveHint = document.getElementById('tc-stash-save-modal-hint');
            if (saveHint) saveHint.innerHTML = html;
        }"""

    new_paint = """        function paintTcStashStorageHint(scope) {
            /* 用例工作台：已移除列表内黄色提示条；仅保留保存弹窗可选说明 */
            scope = scope || 'all';
            if (scope !== 'all' && scope !== 'save') return;
            var saveHint = document.getElementById('tc-stash-save-modal-hint');
            if (!saveHint || !window.HfLocalStash) return;
            saveHint.innerHTML = '';
        }"""

    if old_paint_scoped in text:
        text = text.replace(old_paint_scoped, new_paint, 1)
        print("patched paintTcStashStorageHint (scoped)")
    elif old_paint_simple in text:
        text = text.replace(old_paint_simple, new_paint, 1)
        print("patched paintTcStashStorageHint (simple)")

    # --- initTestCaseStashUi: overlays + guard + open btn ---
    old_init_start = """        function initTestCaseStashUi() {
            ensureTcStashOverlaysMounted();
            setTcStashRailCollapsed(true);
            const openBtn = document.getElementById('tc-stash-open-btn');"""

    new_init_start = """        function initTestCaseStashUi() {
            if (window._tcStashUiBound) return;
            window._tcStashUiBound = true;
            if (typeof ensureTcWorkbenchOverlaysMounted === 'function') {
                ensureTcWorkbenchOverlaysMounted();
            }
            ensureTcStashOverlaysMounted();
            setTcStashRailCollapsed(true);
            const openBtn = document.getElementById('tc-stash-open-btn');"""

    alt_init_start = """        function initTestCaseStashUi() {
            const openBtn = document.getElementById('tc-stash-open-btn');"""

    alt_init_start2 = """        function initTestCaseStashUi() {
            ensureTcStashOverlaysMounted();
            setTcStashRailCollapsed(true);
            const openBtn = document.getElementById('tc-stash-open-btn');"""

    if old_init_start in text:
        text = text.replace(old_init_start, new_init_start, 1)
        print("patched initTestCaseStashUi start (full)")
    elif alt_init_start2 in text:
        text = text.replace(alt_init_start2, new_init_start, 1)
        print("patched initTestCaseStashUi start (alt2)")
    elif alt_init_start in text:
        new_alt = new_init_start.replace(
            "            setTcStashRailCollapsed(true);\n", ""
        )
        text = text.replace(alt_init_start, new_alt, 1)
        print("patched initTestCaseStashUi start (legacy)")
    else:
        raise SystemExit("initTestCaseStashUi start not found")

    old_open_click = """            if (openBtn) {
                openBtn.addEventListener('click', function() {
                    if (!isTcFeatureUnlocked('stash')) {
                        requestTcFeatureUnlock('stash', function() {
                            refreshTcStashList().catch(function() {});
                            var split = document.getElementById('tc-stash-split');
                            if (split && split.classList.contains('tc-stash-rail--collapsed')) {
                                setTcStashRailCollapsed(false);
                            }
                        });
                        return;
                    }
                    setTcStashRailCollapsed(true);
                    refreshTcStashList().catch(function() {});
                    openTcStashSaveModal();
                });
            }"""

    old_open_click2 = old_open_click.replace(
        "                    setTcStashRailCollapsed(true);\n", ""
    )

    new_open_click = """            if (openBtn && !openBtn._tcStashOpenBound) {
                openBtn._tcStashOpenBound = true;
                openBtn.addEventListener('pointerdown', function(e) {
                    e.stopPropagation();
                });
                openBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isTcFeatureUnlocked('stash')) {
                        requestTcFeatureUnlock('stash', function() {
                            refreshTcStashList().catch(function() {});
                        });
                        return;
                    }
                    setTcStashRailCollapsed(true);
                    refreshTcStashList().catch(function() {});
                    openTcStashSaveModal();
                });
            }"""

    if old_open_click in text:
        text = text.replace(old_open_click, new_open_click, 1)
        print("patched openBtn handler (with collapse before save)")
    elif old_open_click2 in text:
        text = text.replace(old_open_click2, new_open_click, 1)
        print("patched openBtn handler (legacy)")

    # sync lock chrome at end of initTestCaseStashUi
    marker = "            if (openBtn && !openBtn._tcStashOpenBound)"
    end_marker = "            if (saveCancel) saveCancel.addEventListener('click', closeTcStashSaveModal);"
    if "            syncTcStashLockChrome();\n            if (saveCancel)" not in text and marker in text and end_marker in text:
        text = text.replace(
            end_marker,
            "            syncTcStashLockChrome();\n" + end_marker,
            1,
        )
        print("added syncTcStashLockChrome at end of stash init")

    # initTcLeftFloatUi: load layout before apply
    old_float_init = """            if (typeof applyDrawerLayout === 'function') {
                applyDrawerLayout(typeof getTcActiveDrawerNum === 'function' ? getTcActiveDrawerNum() : 1);
            }
            syncTcHubAiChrome();"""

    new_float_init = """            loadTcLeftFloatLayoutFromStorage();
            if (typeof applyDrawerLayout === 'function') {
                applyDrawerLayout(typeof getTcActiveDrawerNum === 'function' ? getTcActiveDrawerNum() : 1);
            }
            syncTcHubAiChrome();"""

    if "loadTcLeftFloatLayoutFromStorage();\n            if (typeof applyDrawerLayout" not in text:
        if old_float_init in text:
            text = text.replace(old_float_init, new_float_init, 1)
            print("patched initTcLeftFloatUi load layout")
        else:
            print("warn: initTcLeftFloatUi block not found")

    return text


def main() -> None:
    main_text = MAIN.read_text(encoding="utf-8")
    MAIN.write_text(patch_main(main_text), encoding="utf-8")

    css_text = CSS.read_text(encoding="utf-8")
    CSS.write_text(patch_css(css_text), encoding="utf-8")

    idx_text = INDEX.read_text(encoding="utf-8")
    INDEX.write_text(patch_index(idx_text), encoding="utf-8")
    print("done")


if __name__ == "__main__":
    main()
