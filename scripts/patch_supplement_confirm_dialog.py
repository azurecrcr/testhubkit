#!/usr/bin/env python3
"""Fix supplement-case confirm dialog hidden behind validate side drawer."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DIALOG_OLD = "var TC_WORKBENCH_MODAL_Z_BASE = 10350;"
DIALOG_NEW = "var TC_WORKBENCH_MODAL_Z_BASE = 10650;"

FILL_OLD = """        _pendingCoverageFillScope = fillScope;
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.closeValidateDrawer === 'function') {
            global.TcWorkbenchEnhancements.closeValidateDrawer(fillScope);
        }
        covState().pendingFillRefresh = true;"""

FILL_NEW = """        _pendingCoverageFillScope = fillScope;
        covState().pendingFillRefresh = true;"""

CSS_OLD = """body.tc-hub-ai-tab #tc-app-dialog.tc-app-dialog-root,
body.tc-hub-ai-tab #tc-view-convert-modal {
    z-index: 10350 !important;
}"""

CSS_NEW = """body.tc-hub-ai-tab #tc-app-dialog.tc-app-dialog-root,
body.tc-hub-ai-tab #tc-view-convert-modal {
    z-index: 10650 !important;
}"""


def patch_file(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        if new.split("\n")[0] in text:
            print(label, "already patched")
            return
        raise SystemExit(f"{label}: pattern not found")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("patched", label)


def main() -> None:
    patch_file(
        ROOT / "static/js/tc_workbench/l1_foundation/tc_dialog.js",
        DIALOG_OLD,
        DIALOG_NEW,
        "tc_dialog.js",
    )
    patch_file(
        ROOT / "static/js/tc_workbench/l3_ai/tc_issue_matrix.js",
        FILL_OLD,
        FILL_NEW,
        "tc_issue_matrix.js",
    )
    css_path = ROOT / "templates/partials/tools/tc_workbench_enhancements.css"
    patch_file(css_path, CSS_OLD, CSS_NEW, "tc_workbench_enhancements.css")


if __name__ == "__main__":
    main()
