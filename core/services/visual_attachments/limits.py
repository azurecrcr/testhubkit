"""用例录入附件数量与 prompt 体量上限。"""
from __future__ import annotations

# 单次 Composer 会话内最多附件数（图片 / PDF / TXT 合计）
MAX_ATTACH_FILES = 4

# 单次上传请求最多文件数（不超过会话上限）
MAX_ATTACH_BATCH_FILES = MAX_ATTACH_FILES

# 注入生成 prompt 的附件摘要总字符上限（不含用户提示词）
MAX_PROMPT_BLOCK_CHARS = 14_000

# 单个文本文档写入 prompt 的上限
MAX_TEXT_BODY_CHARS_EACH = 3_000

# 合并后 UI 元素 / 接口端点写入 prompt 的上限
MAX_UI_ELEMENTS_TOTAL = 24
MAX_API_ENDPOINTS_TOTAL = 12
