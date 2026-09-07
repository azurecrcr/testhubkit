#!/usr/bin/env python3
"""One-off server patch: nav /app links, page_shells.css link, /app redirect."""
from pathlib import Path

ROOT = Path("/root/TestHub")

PAGE_SHELLS_LINK = (
    '    <link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/page_shells.css\') }}?v=20260525">'
)


def fix_nav() -> None:
    p = ROOT / "templates/partials/hf_global_nav.html"
    t = p.read_text(encoding="utf-8")
    t = t.replace('href="/app"', 'href="/"')
    p.write_text(t, encoding="utf-8")


def fix_template_link(path: Path) -> None:
    t = path.read_text(encoding="utf-8")
    bad = "<link rel=stylesheet href={{ url_for('static', filename='css/page_shells.css') }}?v=20260525>"
    if bad in t:
        t = t.replace(bad, PAGE_SHELLS_LINK)
    toolkit_line = (
        '    <link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/toolkit.css\') }}">'
    )
    if "page_shells.css" not in t and toolkit_line in t:
        t = t.replace(
            toolkit_line,
            toolkit_line + "\n" + PAGE_SHELLS_LINK,
            1,
        )
    path.write_text(t, encoding="utf-8")


def fix_home() -> None:
    p = ROOT / "core/blueprints/pages/home.py"
    t = p.read_text(encoding="utf-8")
    if 'route("/app")' in t:
        return
    t = t.replace(
        "from flask import Blueprint, render_template",
        "from flask import Blueprint, redirect, render_template, url_for",
    )
    t = t.replace(
        '    @bp.route("/")\n    def index():',
        '    @bp.route("/app")\n'
        '    def app_home_redirect():\n'
        '        return redirect(url_for("pages.index"))\n\n'
        '    @bp.route("/")\n'
        '    def index():',
    )
    p.write_text(t, encoding="utf-8")


def main() -> None:
    fix_nav()
    fix_template_link(ROOT / "templates/index.html")
    fix_template_link(ROOT / "templates/load_test_hub.html")
    fix_home()
    print("patch ok")


if __name__ == "__main__":
    main()
