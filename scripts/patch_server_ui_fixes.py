#!/usr/bin/env python3
"""Patch server index.html for left-float panel default collapsed."""
from pathlib import Path

ROOT = Path("/root/TestHub")
INDEX = ROOT / "templates/index.html"


def patch_apply_drawer_layout(text: str) -> str:
    old = """            shell.classList.toggle('tc-left-float--open', !isCollapsed);
            leftPanel.classList.toggle('tc-left-float-panel--collapsed', isCollapsed);
            leftPanel.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');"""
    if old in text:
        return text
    needle = """            shell.classList.toggle('tc-left-float--open', !isCollapsed);
            leftPanel.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');"""
    repl = """            shell.classList.toggle('tc-left-float--open', !isCollapsed);
            leftPanel.classList.toggle('tc-left-float-panel--collapsed', isCollapsed);
            leftPanel.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');"""
    if needle not in text:
        raise SystemExit("applyDrawerLayout block not found")
    return text.replace(needle, repl, 1)


def patch_init_tc_left_float_ui(text: str) -> str:
    old = """            ensureTcLeftFloatLayersMounted();
            syncTcHubAiChrome();
            syncTcLeftInputFloatChrome();
            document.querySelectorAll('[data-tc-float-drawer]').forEach(function(btn) {"""
    new = """            ensureTcLeftFloatLayersMounted();
            if (typeof applyDrawerLayout === 'function') {
                applyDrawerLayout(typeof getTcActiveDrawerNum === 'function' ? getTcActiveDrawerNum() : 1);
            }
            syncTcHubAiChrome();
            syncTcLeftInputFloatChrome();
            document.querySelectorAll('[data-tc-float-drawer]').forEach(function(btn) {"""
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit("initTcLeftFloatUi block not found")


def patch_switch_drawer(text: str) -> str:
    pairs = [
        (
            "btn.classList.remove('text-blue-600');\n                btn.classList.add('text-slate-500');",
            "btn.classList.remove('text-blue-600', 'text-slate-500', 'tc-mode-nav__btn--active');",
        ),
        (
            "drawer2Btn.classList.add('text-blue-600');\n                    drawer2Btn.classList.remove('text-slate-500');",
            "drawer2Btn.classList.add('tc-mode-nav__btn--active');",
        ),
        (
            "drawer1Btn.classList.add('text-blue-600');\n                    drawer1Btn.classList.remove('text-slate-500');",
            "drawer1Btn.classList.add('tc-mode-nav__btn--active');",
        ),
    ]
    for old, new in pairs:
        if old in text:
            text = text.replace(old, new, 1)
    return text


def main() -> None:
    text = INDEX.read_text(encoding="utf-8")
    text = patch_apply_drawer_layout(text)
    text = patch_init_tc_left_float_ui(text)
    text = patch_switch_drawer(text)
    INDEX.write_text(text, encoding="utf-8")
    print("index.html patched ok")


if __name__ == "__main__":
    main()
