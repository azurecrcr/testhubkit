#!/usr/bin/env python3
"""修复暂存列表收起、高度异常；调整录入弹窗 Tab 与提示词库背景。"""
from pathlib import Path

ROOT = Path("/root/TestHub")
INDEX = ROOT / "templates/index.html"
TOOLKIT = ROOT / "static/css/toolkit.css"
PAGE_SHELLS = ROOT / "static/css/page_shells.css"
PROMPT = ROOT / "templates/prompt_library.html"


def patch_index(text):
    old_paint = """        function paintTcStashStorageHint() {
            if (!window.HfLocalStash) return;
            var html = HfLocalStash.retentionHintHtml();
            var el = document.getElementById('tc-stash-storage-hint');
            if (el) el.innerHTML = html;
            var saveHint = document.getElementById('tc-stash-save-modal-hint');
            if (saveHint) saveHint.innerHTML = html;
        }"""

    new_paint = """        function paintTcStashStorageHint(scope) {
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

    if old_paint in text:
        text = text.replace(old_paint, new_paint, 1)
    elif "opts.listOnly" not in text:
        raise SystemExit("paintTcStashStorageHint block not found")

    old_open = """        function openTcStashSaveModal() {
            if (!isTcFeatureUnlocked('stash')) {
                requestTcFeatureUnlock('stash', function() { openTcStashSaveModal(); });
                return;
            }
            paintTcStashStorageHint();
            const m = document.getElementById('tc-stash-save-modal');"""

    new_open = """        function openTcStashSaveModal() {
            if (!isTcFeatureUnlocked('stash')) {
                requestTcFeatureUnlock('stash', function() { openTcStashSaveModal(); });
                return;
            }
            setTcStashRailCollapsed(true);
            paintTcStashStorageHint('save');
            const m = document.getElementById('tc-stash-save-modal');"""

    if old_open in text:
        text = text.replace(old_open, new_open, 1)

    old_set = """            if (railCol) {
                railCol.classList.toggle('tc-stash-rail-col--collapsed', collapsed);
                railCol.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
            }
            syncTcStashRailFabUi();
        }

        function resetTcStashRailAnchorPosition()"""

    new_set = """            if (railCol) {
                railCol.classList.toggle('tc-stash-rail-col--collapsed', collapsed);
                railCol.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
            }
            syncTcStashRailFabUi();
            if (!collapsed && typeof refreshTcStashList === 'function') {
                refreshTcStashList().catch(function() {});
                paintTcStashStorageHint('list');
            } else if (collapsed) {
                paintTcStashStorageHint('list');
            }
        }

        function resetTcStashRailAnchorPosition()"""

    if old_set in text:
        text = text.replace(old_set, new_set, 1)

    old_end_ptr = """                if (!wasDrag && typeof toggleRailFromUi === 'function') {
                    toggleRailFromUi();
                }
            }

            handle.addEventListener('pointerdown', function(e) {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                if (document.body.classList.contains('tc-stash-locked')) return;
                e.preventDefault();
                e.stopPropagation();
                pointerDown = true;"""

    new_end_ptr = """                if (!wasDrag && typeof toggleRailFromUi === 'function') {
                    toggleRailFromUi();
                    suppressExpandClick = true;
                    window.setTimeout(function() { suppressExpandClick = false; }, 450);
                }
            }

            handle.addEventListener('click', function(e) {
                if (suppressExpandClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (document.body.classList.contains('tc-stash-fab-dragging')) return;
                if (document.body.classList.contains('tc-stash-locked')) return;
            }, true);

            handle.addEventListener('pointerdown', function(e) {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                if (document.body.classList.contains('tc-stash-locked')) return;
                e.preventDefault();
                e.stopPropagation();
                pointerDown = true;"""

    if old_end_ptr in text:
        text = text.replace(old_end_ptr, new_end_ptr, 1)
    elif "suppressExpandClick" in text:
        pass
    else:
        raise SystemExit("initTcStashFabRootDrag endRootPointer not found")

    old_drag_init = """            var startLeft = 0;
            var startTop = 0;

            function applyRootPosition(left, top) {"""
    new_drag_init = """            var startLeft = 0;
            var startTop = 0;
            var suppressExpandClick = false;

            function applyRootPosition(left, top) {"""
    if old_drag_init in text and "var suppressExpandClick" not in text:
        text = text.replace(old_drag_init, new_drag_init, 1)

    old_open_btn = """                    refreshTcStashList().catch(function() {});
                    openTcStashSaveModal();
                });
            }"""

    new_open_btn = """                    setTcStashRailCollapsed(true);
                    refreshTcStashList().catch(function() {});
                    openTcStashSaveModal();
                });
            }"""

    if old_open_btn in text:
        text = text.replace(old_open_btn, new_open_btn, 1)

    return text


def patch_toolkit_css(text):
    block = """
        /* 暂存列表挂到 body 后须用 rail-col 自身 class 控制显隐 */
        #tc-stash-rail-col.tc-stash-rail-col--collapsed {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
        #tc-stash-external-rail {
            max-height: min(calc(100dvh - 11rem), 20rem);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        #tc-stash-drawer-list-panel {
            flex: 1 1 auto;
            min-height: 0;
            max-height: 15rem;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        #tc-stash-storage-hint {
            flex-shrink: 0;
            max-height: 3.75rem;
            overflow-y: auto;
        }
        #tc-stash-list {
            flex: 1 1 auto;
            min-height: 4.5rem;
            max-height: 10.5rem;
            overflow-x: hidden;
            overflow-y: auto;
        }
        #tc-stash-list > p {
            min-height: 4.5rem;
            box-sizing: border-box;
        }
        /* 用例录入浮窗：AI 生成 / 手动导入 胶囊分段 */
        #left-panel.tc-left-float-panel .tc-left-panel__head--mode {
            padding-bottom: 0.35rem;
        }
        #left-panel.tc-left-float-panel #drawer-tabs.tc-mode-nav--compact {
            display: inline-flex;
            width: 100%;
            gap: 0.15rem;
            padding: 0.15rem;
            border-radius: 9999px;
            border: 1px solid rgba(226, 232, 240, 0.95);
            background: rgba(241, 245, 249, 0.95);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
        }
        #left-panel.tc-left-float-panel #drawer-tabs.tc-mode-nav--compact .tc-mode-nav__btn {
            flex: 1 1 0;
            padding: 0.36rem 0.5rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.01em;
        }
        #left-panel.tc-left-float-panel #drawer-tabs.tc-mode-nav--compact .tc-mode-nav__btn.tc-mode-nav__btn--active {
            border-color: rgba(99, 102, 241, 0.32) !important;
            background: linear-gradient(180deg, #fff 0%, #eef2ff 100%) !important;
            color: #4338ca !important;
            box-shadow: 0 1px 3px rgba(79, 70, 229, 0.14) !important;
        }
        #left-panel.tc-left-float-panel #drawer-tabs.tc-mode-nav--compact .tc-mode-nav__btn:not(.tc-mode-nav__btn--active):hover {
            background: rgba(255, 255, 255, 0.9);
            color: #334155;
        }
"""
    if "tc-stash-rail-col--collapsed" in text and "display: none !important" in text:
        return text
    needle = "        #tc-stash-split.tc-stash-rail--collapsed #tc-stash-rail-col {"
    if needle not in text:
        raise SystemExit("toolkit stash CSS anchor not found")
    return text.replace(needle, block + needle, 1)


def patch_page_shells(text):
    block = """
/* —— 提示词库：整页固定背景 —— */
.hf-prompt-page__bg {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
}

.hf-prompt-page__bg-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    object-fit: cover;
    object-position: center top;
    display: block;
}

.hf-prompt-page__bg-scrim {
    position: absolute;
    inset: 0;
    background:
        linear-gradient(180deg, rgba(248, 250, 252, 0.35) 0%, rgba(238, 242, 255, 0.55) 38%, rgba(248, 250, 252, 0.82) 100%),
        linear-gradient(100deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.14) 100%);
}

body.hf-prompt-page-body {
    background-color: #f8fafc;
}

main.hf-prompt-page-main {
    position: relative;
    z-index: 1;
}

.hf-prompt-hero--has-img {
    position: relative;
    overflow: hidden;
}

.hf-prompt-hero--has-img .hf-prompt-hero__bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
}

.hf-prompt-hero--has-img .hf-prompt-hero__bg-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 40%;
    display: block;
}

.hf-prompt-hero--has-img .hf-prompt-hero__bg-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(125deg, rgba(49, 46, 129, 0.82) 0%, rgba(67, 56, 202, 0.75) 42%, rgba(14, 116, 144, 0.72) 100%);
}
"""
    if "hf-prompt-page__bg" in text:
        return text
    return text + block


def patch_prompt_library(text):
    if "hf-prompt-page__bg" in text:
        return text
    old_body = '<body class="min-h-screen bg-slate-50 text-slate-800 bg-[radial-gradient(circle_at_20%_0%,#e0e7ff_0%,transparent_45%),radial-gradient(circle_at_80%_30%,#cffafe_0%,transparent_40%),#f8fafc]">'
    new_body = '<body class="hf-prompt-page-body min-h-screen text-slate-800">'
    if old_body not in text:
        raise SystemExit("prompt_library body tag not found")
    text = text.replace(old_body, new_body, 1)

    old_main = """    {% include 'partials/hf_global_nav.html' %}

    <main class="container mx-auto px-4 py-8 sm:py-10 max-w-6xl">
        <div class="hf-prompt-hero rounded-3xl p-6 sm:p-8 md:p-10 text-white shadow-xl mb-8 sm:mb-10">
            <div class="relative z-10 max-w-2xl">"""

    new_main = """    {% include 'partials/hf_global_nav.html' %}

    <div class="hf-prompt-page__bg" aria-hidden="true">
        <img src="{{ url_for('static', filename='images/prompts/prompts-bg-page.png') }}" alt="" class="hf-prompt-page__bg-img" width="1920" height="1600" loading="eager" decoding="async">
        <div class="hf-prompt-page__bg-scrim"></div>
    </div>

    <main class="hf-prompt-page-main container mx-auto px-4 py-8 sm:py-10 max-w-6xl">
        <div class="hf-prompt-hero hf-prompt-hero--has-img rounded-3xl p-6 sm:p-8 md:p-10 text-white shadow-xl mb-8 sm:mb-10">
            <div class="hf-prompt-hero__bg" aria-hidden="true">
                <img src="{{ url_for('static', filename='images/prompts/prompts-bg-hero.png') }}" alt="" class="hf-prompt-hero__bg-img" width="1920" height="520" loading="eager" decoding="async">
                <div class="hf-prompt-hero__bg-scrim"></div>
            </div>
            <div class="relative z-10 max-w-2xl">"""

    text = text.replace(old_main, new_main, 1)

    if "page_shells.css" not in text:
        old_link = '<link rel="stylesheet" href="/static/css/toolkit.css">'
        new_link = old_link + '\n    <link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/page_shells.css\') }}?v=20260527">'
        text = text.replace(old_link, new_link, 1)

    return text


def main():
    idx = INDEX.read_text(encoding="utf-8")
    idx = patch_index(idx)
    INDEX.write_text(idx, encoding="utf-8")
    print("index.html ok")

    tk = TOOLKIT.read_text(encoding="utf-8")
    tk = patch_toolkit_css(tk)
    TOOLKIT.write_text(tk, encoding="utf-8")
    print("toolkit.css ok")

    ps = PAGE_SHELLS.read_text(encoding="utf-8")
    ps = patch_page_shells(ps)
    PAGE_SHELLS.write_text(ps, encoding="utf-8")
    print("page_shells.css ok")

    pl = PROMPT.read_text(encoding="utf-8")
    pl = patch_prompt_library(pl)
    PROMPT.write_text(pl, encoding="utf-8")
    print("prompt_library.html ok")


if __name__ == "__main__":
    main()
