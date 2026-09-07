#!/usr/bin/env python3
"""Fix undefined otherScope in collapseOtherValidateDrawerBeforeOpen."""
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1] / "static/js/tc_workbench/features/enhancements/tc_wb_validation.js"

BROKEN = """    function collapseOtherValidateDrawerBeforeOpen(activeScope) {
        activeScope = normalizeValidateScope(activeScope);
                closeValidateDrawerForHandoff(otherScope);
        if (activeScope === VALIDATE_SCOPE_SINGLE) {
            var agentDrawer = $('tc-agent-drawer');
            if (isDrawerExpanded(agentDrawer, 'tc-agent-drawer--open')) {
                var agentMinBtn = $('tc-agent-drawer-minimize');
                if (agentMinBtn) agentMinBtn.click();
            }
        }
        updateValidateReopenBtnForScope(otherScope);
    }

    function syncValidateReopenButtonsLayout() {
                var topBase = 20;
        if (agentBtn && !agentBtn.classList.contains('hidden')) {"""

FIXED = """    function collapseOtherValidateDrawerBeforeOpen(activeScope) {
        activeScope = normalizeValidateScope(activeScope);
        if (activeScope === VALIDATE_SCOPE_SINGLE) {
            var agentDrawer = $('tc-agent-drawer');
            if (isDrawerExpanded(agentDrawer, 'tc-agent-drawer--open')) {
                var agentMinBtn = $('tc-agent-drawer-minimize');
                if (agentMinBtn) agentMinBtn.click();
            }
        }
    }

    function syncValidateReopenButtonsLayout() {
        var topBase = 20;
        var agentBtn = $('tc-validate-float-reopen-btn-agent');
        if (agentBtn && !agentBtn.classList.contains('hidden')) {"""


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    if BROKEN not in text:
        if "closeValidateDrawerForHandoff(otherScope)" not in text:
            print("already fixed or pattern not found")
            return
        raise SystemExit("unexpected file shape")
    TARGET.write_text(text.replace(BROKEN, FIXED, 1), encoding="utf-8")
    print("patched", TARGET)


if __name__ == "__main__":
    main()
