"""测试用例相关 API：按子模块拆分路由注册。"""

from __future__ import annotations

from flask import Blueprint

from . import (
    ai_form_prefs,
    case_to_mindmap,
    coverage,
    generation_jobs,
    generator,
    generation_sessions,
    importer,
    lanhu,
    shares,
    system_prompts,
    templates,
    validation,
    export_reports,
    visual_attachments,
    workbench_sessions,
    smart_edit,
    mindmap_smart_edit,
    page_generation_lock,
    requirement_cases,
    requirement_mindmaps,
)


def register_routes(bp: Blueprint) -> None:
    generator.register_routes(bp)
    generation_jobs.register_routes(bp)
    generation_sessions.register_routes(bp)
    lanhu.register_routes(bp)
    importer.register_routes(bp)
    coverage.register_routes(bp)
    templates.register_routes(bp)
    system_prompts.register_routes(bp)
    case_to_mindmap.register_routes(bp)
    validation.register_routes(bp)
    export_reports.register_routes(bp)
    ai_form_prefs.register_routes(bp)
    shares.register_routes(bp)
    visual_attachments.register_routes(bp)
    workbench_sessions.register_routes(bp)
    smart_edit.register_routes(bp)
    mindmap_smart_edit.register_routes(bp)
    page_generation_lock.register_routes(bp)
    requirement_cases.register_routes(bp)
    requirement_mindmaps.register_routes(bp)
