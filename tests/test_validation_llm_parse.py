"""LLM 质量检查 issues 解析（仅 content）。"""
from __future__ import annotations

import unittest

from core.services.test_cases.validation_service import (
    LlmValidationParseError,
    TC_VALIDATION_ISSUE_LIST_EXAMPLE,
    TC_VALIDATION_OUTPUT_FORMAT_EXAMPLE,
    TC_VALIDATION_RESULT_END,
    TC_VALIDATION_RESULT_START,
    _llm_issues_payload_present,
    _parse_llm_issues,
    _resolve_llm_issues_from_response,
    _resolve_llm_qc_issues_empty_content_as_pass,
)


def _wrap_issue_list(issue_list_body: str) -> str:
    return (
        f"{TC_VALIDATION_RESULT_START}\n{issue_list_body}\n{TC_VALIDATION_RESULT_END}"
    )


def _wrap_issues(issues_json: str) -> str:
    return (
        f"{TC_VALIDATION_RESULT_START}\n{issues_json}\n{TC_VALIDATION_RESULT_END}"
    )


class TestValidationLlmParse(unittest.TestCase):
    def test_parse_issue_list_structured_content(self):
        raw = _wrap_issue_list(
            'issue_list = [{"type":"hallucination","feature":"新建工单","status":"open",'
            '"case_index":0,"description":"需求未提及新建工单功能"}]'
        )
        issues = _resolve_llm_issues_from_response(content=raw, reasoning="")
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["type"], "hallucination")

    def test_parse_bold_issue_list(self):
        raw = _wrap_issue_list(
            '**issue_list** = [{"type":"gap","feature":"Tab菜单","status":"open",'
            '"case_index":0,"description":"未覆盖Tab切换"}]'
        )
        issues = _resolve_llm_issues_from_response(content=raw, reasoning="")
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["type"], "gap")

    def test_empty_content_raises(self):
        with self.assertRaises(LlmValidationParseError):
            _resolve_llm_issues_from_response(content="", reasoning="has block")

    def test_reasoning_only_raises(self):
        raw = _wrap_issue_list(
            'issue_list = [{"type":"gap","feature":"x","status":"open","case_index":0,"description":"d"}]'
        )
        with self.assertRaises(LlmValidationParseError):
            _resolve_llm_issues_from_response(content="", reasoning=raw)

    def test_qc_empty_content_as_pass(self):
        issues = _resolve_llm_qc_issues_empty_content_as_pass(
            content="", reasoning="仅有思考过程，无正式 content"
        )
        self.assertEqual(issues, [])

    def test_qc_empty_content_ignores_reasoning_payload(self):
        raw = _wrap_issue_list(
            'issue_list = [{"type":"gap","feature":"x","status":"open","case_index":0,"description":"d"}]'
        )
        issues = _resolve_llm_qc_issues_empty_content_as_pass(content="", reasoning=raw)
        self.assertEqual(issues, [])

    def test_qc_nonempty_content_still_parses(self):
        content = _wrap_issue_list("issue_list = []")
        issues = _resolve_llm_qc_issues_empty_content_as_pass(content=content, reasoning="")
        self.assertEqual(issues, [])

    def test_qc_unparseable_content_still_raises(self):
        with self.assertRaises(LlmValidationParseError):
            _resolve_llm_qc_issues_empty_content_as_pass(
                content="思考过程，无标记块", reasoning=""
            )

    def test_structured_empty_content_returns_empty(self):
        content = _wrap_issue_list("issue_list = []")
        issues = _resolve_llm_issues_from_response(content=content, reasoning="")
        self.assertEqual(issues, [])

    def test_unparseable_content_raises(self):
        with self.assertRaises(LlmValidationParseError):
            _resolve_llm_issues_from_response(content="思考过程，无标记块", reasoning="")

    def test_prompt_contains_issue_list_format(self):
        from core.services.test_cases.validation_service import _build_llm_quality_prompt

        prompt = _build_llm_quality_prompt(
            requirements="需求",
            columns=["用例名称"],
            rows=[["用例A"]],
        )
        self.assertIn("issue_list", prompt)
        self.assertIn(TC_VALIDATION_RESULT_START, prompt)
        self.assertIn(TC_VALIDATION_ISSUE_LIST_EXAMPLE, prompt)

    def test_parse_structured_content_issues(self):
        raw = _wrap_issues(
            '{"issues":[{"type":"gap","message":"遗漏点","row_index":2}]}'
        )
        issues = _resolve_llm_issues_from_response(content=raw, reasoning="")
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["row_index"], 2)

    def test_legacy_issues_format_still_supported(self):
        raw = _wrap_issues(
            '{"issues":[{"type":"gap","message":"遗留格式","row_index":2}]}'
        )
        issues = _resolve_llm_issues_from_response(content=raw, reasoning="")
        self.assertEqual(len(issues), 1)

    def test_parse_content_issues(self):
        raw = '{"issues":[{"type":"hallucination","message":"多余功能","row_index":0}]}'
        issues = _parse_llm_issues(raw)
        self.assertEqual(len(issues), 1)

    def test_llm_issues_payload_present_empty_array(self):
        content = '{"issues":[]}'
        self.assertTrue(_llm_issues_payload_present(content))
        issues = _resolve_llm_issues_from_response(content=content, reasoning="")
        self.assertEqual(issues, [])


if __name__ == "__main__":
    unittest.main()
