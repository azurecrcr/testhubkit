"""用户协议与隐私政策页面。"""

from __future__ import annotations

from flask import Blueprint, abort, render_template


_DOCS = {
    "terms": {
        "slug": "terms",
        "title": "用户协议",
        "updated": "2026年7月31日",
        "template": "legal_terms.html",
    },
    "privacy": {
        "slug": "privacy",
        "title": "隐私政策",
        "updated": "2026年7月31日",
        "template": "legal_privacy.html",
    },
}


def register_routes(bp: Blueprint) -> None:
    @bp.route("/legal/<slug>")
    def legal_document(slug: str):
        doc = _DOCS.get((slug or "").strip().lower())
        if not doc:
            abort(404)
        return render_template(
            doc["template"],
            active_page="legal",
            legal_slug=doc["slug"],
            legal_title=doc["title"],
            legal_updated=doc["updated"],
        )
