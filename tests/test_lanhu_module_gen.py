from core.services.test_cases.agent_orchestrator_service import _build_step_plan
from core.services.test_cases.lanhu_requirement_service import (
    MODULE_GEN_MIN_PAGE_CHARS,
    _page_text_char_count,
    fetch_lanhu_requirements_summary,
    lanhu_use_module_pipeline,
)


def test_page_text_char_count_sums_target_pages():
    pages = [
        {"text": "a" * 1200},
        {"text": "b" * 900},
    ]
    assert _page_text_char_count(pages) == 2100


def test_module_gen_threshold_default_is_2000():
    assert MODULE_GEN_MIN_PAGE_CHARS == 2000


def test_build_step_plan_module_gen_only():
    steps = _build_step_plan("module_gen_only")
    assert [key for key, _ in steps] == [
        "split_modules",
        "generate_modules",
        "dedupe",
    ]


def test_lanhu_use_module_pipeline_from_fetch_meta():
    assert lanhu_use_module_pipeline(1999) is False
    assert lanhu_use_module_pipeline(2000) is True
    assert lanhu_use_module_pipeline(2074) is True


def test_fetch_lanhu_requirements_summary_still_returns_text(monkeypatch):
    monkeypatch.setattr(
        "core.services.test_cases.lanhu_requirement_service.fetch_lanhu_requirements_result",
        lambda _cookie, _url: {
            "summary": "需求摘要",
            "page_text_chars": 2500,
            "use_module_pipeline": True,
        },
    )
    assert fetch_lanhu_requirements_summary("cookie", "https://lanhuapp.com/web/#/item/project/product?docId=1") == "需求摘要"
