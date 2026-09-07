"""昵称必填校验。"""
from __future__ import annotations

import unittest

from core.services.auth.user_service import _validate_display_name


class TestAuthDisplayName(unittest.TestCase):
    def test_optional_allows_empty(self):
        self.assertIsNone(_validate_display_name(""))
        self.assertIsNone(_validate_display_name(None))

    def test_required_rejects_empty(self):
        with self.assertRaises(ValueError) as ctx:
            _validate_display_name("", required=True)
        self.assertIn("昵称", str(ctx.exception))

    def test_required_accepts_trimmed(self):
        self.assertEqual(_validate_display_name("  测试昵称  ", required=True), "测试昵称")

    def test_max_length(self):
        with self.assertRaises(ValueError):
            _validate_display_name("x" * 65, required=True)


if __name__ == "__main__":
    unittest.main()
