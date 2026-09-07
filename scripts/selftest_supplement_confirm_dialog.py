#!/usr/bin/env python3
"""Self-test supplement confirm dialog fix markers."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION = "20260616fillallturn2"
checks = []


def ok(label: str) -> None:
    checks.append(("OK", label))


def fail(label: str, detail: str = "") -> None:
    checks.append(("FAIL", label + (": " + detail if detail else "")))


def must_contain(path: Path, needle: str, label: str) -> None:
    if not path.is_file():
        fail(label, f"missing {path}")
        return
    text = path.read_text(encoding="utf-8")
    if needle in text:
        ok(label)
    else:
        fail(label, f"not found in {path.name}")


def must_not_contain(path: Path, needle: str, label: str) -> None:
    if not path.is_file():
        fail(label, f"missing {path}")
        return
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        ok(label)
    else:
        fail(label, f"unexpected in {path.name}")


def main() -> int:
    must_contain(
        ROOT / "static/js/tc_workbench/l1_foundation/tc_dialog.js",
        "TC_WORKBENCH_MODAL_Z_BASE = 10750",
        "dialog z-base",
    )
    must_contain(
        ROOT / "static/js/tc_workbench/l3_ai/tc_agent_orchestrator.js",
        "tc-wb-supplement-confirm-open",
        "supplement confirm body class",
    )
    must_contain(
        ROOT / "static/js/tc_workbench/l3_ai/tc_issue_matrix.js",
        "requestAnimationFrame(launchFillJob)",
        "deferred fill job launch",
    )
    must_not_contain(
        ROOT / "static/js/tc_workbench/l3_ai/tc_issue_matrix.js",
        "closeValidateDrawer(fillScope);\n        covState().pendingFillRefresh = true;",
        "no early drawer close before confirm",
    )
    must_contain(
        ROOT / "static/css/tc_workbench_enhancements.css",
        "z-index: 10850 !important",
        "css confirm boost",
    )
    must_contain(
        ROOT / "static/js/tc_workbench/features/enhancements/tc_wb_validation.js",
        "isValidateViewingLatestSessionTurn",
        "fill-all latest turn guard",
    )
    must_contain(
        ROOT / "static/js/tc_workbench/features/enhancements/tc_wb_snapshot_diff.js",
        "bindValidateFloatPanel(VALIDATE_SCOPE_SINGLE)",
        "validate drawer close bind",
    )
    must_contain(
        ROOT / "static/js/tc_workbench/l2_services/tc_workbench_session.js",
        "getLatestSessionTurnId",
        "latest session turn id",
    )
    must_not_contain(
        ROOT / "templates/partials/tools/tc_workbench_enhancements.html",
        "tc-coverage-fill-uncovered-btn",
        "no fill-uncovered button",
    )
    must_contain(
        ROOT / "templates/partials/tools/tc_workbench_enhancements.html",
        'id="tc-agent-drawer"',
        "agent drawer html",
    )
    must_contain(
        ROOT / "static/css/tc_workbench_enhancements.css",
        "#tc-agent-drawer.tc-agent-drawer--side",
        "agent drawer css",
    )
    manifest = ROOT / "templates/partials/tools/tc_workbench/_scripts_manifest.bundle.html"
    if manifest.is_file() and VERSION in manifest.read_text(encoding="utf-8"):
        ok("manifest version")
    else:
        fail("manifest version", VERSION)

    for status, label in checks:
        print(status, label)
    failed = sum(1 for s, _ in checks if s == "FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
