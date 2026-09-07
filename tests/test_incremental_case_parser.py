"""增量用例解析：test_cases 列表、Unicode 引号、reasoning 载荷。"""
from __future__ import annotations

import unittest

from core.services.test_cases.incremental_case_parser import parse_list_rows_from_text, parse_rows_from_text

USER_SAMPLE = '''test_cases = [
    [
        "验证实训训练卡片"进入训练"按钮在"可开始"状态下的点击交互",
        "工作台",
        "功能测试,UI交互",
        "用户已登录系统并进入工作台页面，存在一个状态为"可开始"且当前时间在设定时间段内的实训训练卡片",
        "1. 观察实训训练卡片底部的"进入训练"按钮样式；\\n2. 点击"进入训练"按钮。",
        "1. "进入训练"按钮显示为绿色背景白色文字的可点击样式；\\n2. 点击后成功跳转到对应的实际训练操作页面。",
        "STEP",
        "无",
        "P1"
    ]
]'''


class TestIncrementalCaseParser(unittest.TestCase):
    def test_parse_user_ascii_nested_quotes_sample(self):
        rows = parse_rows_from_text(USER_SAMPLE, 9)
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(rows[0]), 9)
        self.assertIn("进入训练", rows[0][0])

    def test_parse_unicode_curly_quotes_sample(self):
        text = USER_SAMPLE.replace('"进入训练"', '\u201c进入训练\u201d')
        text = text.replace('"可开始"', '\u201c可开始\u201d')
        rows = parse_rows_from_text(text, 9)
        self.assertEqual(len(rows), 1)
        self.assertIn("进入训练", rows[0][0])

    def test_parse_from_reasoning_tail(self):
        reasoning = "分析过程...\n" + USER_SAMPLE
        rows = parse_list_rows_from_text(reasoning, columns_count=9)
        self.assertEqual(len(rows), 1)




NINE_CASE_SAMPLE = r"""```python
test_cases = [
[
"验证测试类型课时未上传图片时显示默认图",
"课程管理",
"",
"1、登录AI手术培训系统\n2、进入课程管理页面\n3、存在测试类型的课时且未上传自定义图片",
"[1]查看测试类型课时的图片展示区域\n[2]对比展示图片与系统设计的测试类型默认图",
"[1]图片区域有图片展示，非空白或破损图\n[2]展示图片与系统设计的测试类型默认图一致",
"STEP",
"",
"P0"
],
[
"验证课程简介字段必填标识展示",
"课程管理",
"",
"1、登录AI手术培训系统\n2、进入课程管理页面\n3、点击新增或编辑课程进入表单页",
"[1]查看课程简介字段的UI标识",
"[1]课程简介字段名称旁显示必填标识（如红色*号）",
"STEP",
"",
"P1"
]
]
```"""


class TestNineCaseRegression(unittest.TestCase):
    def test_parse_nine_case_course_sample(self):
        rows = parse_rows_from_text(NINE_CASE_SAMPLE, 9)
        self.assertGreaterEqual(len(rows), 2)
        self.assertIn("必填标识", rows[-1][0])

if __name__ == "__main__":
    unittest.main()
