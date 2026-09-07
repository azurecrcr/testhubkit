"""增量解析 LLM 流式输出的 test_cases 列表行。"""
from __future__ import annotations

import ast
import json
import re
from typing import Any


def _strip_code_fences(text: str) -> str:
    text = str(text or "")
    blocks = re.findall(
        r"```(?:python|json|javascript|js|txt|text|plaintext|markdown)?\s*([\s\S]*?)```",
        text,
        flags=re.IGNORECASE,
    )
    if blocks:
        tc_blocks = [b for b in blocks if re.search(r"test_cases\s*=|\[\s*(\[|\{)", b)]
        if tc_blocks:
            return tc_blocks[-1]
        return blocks[-1]
    if "```" in text:
        text = re.sub(r"```[\w]*\n?", "\n", text)
    return text


def _normalize_unicode_quotes(text: str) -> str:
    """将中文/全角引号规范为 ASCII，便于 ast/json 解析。"""
    s = str(text or "")
    for ch in ("\u201c", "\u201d", "\u201e", "\u201f", "\uff02"):
        s = s.replace(ch, '"')
    for ch in ("\u2018", "\u2019", "\u201a", "\u201b", "\uff07"):
        s = s.replace(ch, "'")
    return s


def _sanitize_ai_inline_quotes(text: str) -> str:
    """修复双引号字符串内误用成对引号包裹中文短语（与前端 sanitizeAiInlineQuotes 一致）。"""
    s = str(text or "")
    if not s:
        return s
    out: list[str] = []
    in_str = False
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if not in_str:
            out.append(ch)
            if ch == '"':
                in_str = True
            i += 1
            continue
        if ch == '"' and s[i - 1] != "\\":
            j = i + 1
            while j < n and "\u4e00" <= s[j] <= "\u9fff":
                j += 1
            if j > i + 1 and j < n and s[j] == '"':
                out.append("'")
                i += 1
                while i < n and s[i] != '"':
                    out.append(s[i])
                    i += 1
                if i < n and s[i] == '"':
                    out.append("'")
                    i += 1
                continue
            in_str = False
            out.append(ch)
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _normalize_ai_list_literal(text: str) -> str:
    s = _sanitize_ai_inline_quotes(_normalize_unicode_quotes(str(text or "")))
    s = re.sub(r"\bNone\b", "null", s)
    s = re.sub(r"\bTrue\b", "true", s)
    s = re.sub(r"\bFalse\b", "false", s)
    s = re.sub(r",\s*([\]}])", r"\1", s)
    return s


def _fix_nested_ascii_quotes(text: str) -> str:
    """Fix nested ASCII double quotes inside Python string literals (common in Chinese model output)."""
    s = str(text or "")
    if not s:
        return s
    out: list[str] = []
    in_str = False
    str_char = ""
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if not in_str and ch in ('"', "'"):
            in_str = True
            str_char = ch
            out.append(ch)
            i += 1
            continue
        if in_str and ch == str_char and s[i - 1] != "\\":
            k = i + 1
            while k < n and s[k] in " \t\r\n":
                k += 1
            if str_char == '"' and k < n and s[k] not in {",", "]", ")", '"'}:
                out.append("'")
                i += 1
                while i < n:
                    if s[i] == '"' and s[i - 1] != "\\":
                        out.append("'")
                        i += 1
                        break
                    out.append(s[i])
                    i += 1
                continue
            in_str = False
            out.append(ch)
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _strip_prefix(text: str) -> str:
    text = _strip_code_fences(text)
    trimmed = text.strip()
    if trimmed.startswith("{") and "test_cases" in trimmed:
        try:
            wrapper = json.loads(trimmed)
            if isinstance(wrapper, dict) and isinstance(wrapper.get("test_cases"), list):
                return json.dumps(wrapper["test_cases"])
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    text = re.sub(r"test_cases\s*=\s*", "", text, count=1)
    text = _normalize_unicode_quotes(text)
    text = _fix_nested_ascii_quotes(text)
    text = _sanitize_ai_inline_quotes(text)
    return text


def _find_outer_list_start(text: str) -> int:
    for i, ch in enumerate(text):
        if ch == "[":
            return i
    return -1


def _extract_complete_row_arrays(
    text: str, outer_bracket_pos: int, scan_from: int
) -> list[tuple[int, str]]:
    """在外层列表内扫描完整的用例行（内层数组），返回 (end_index, literal_str)。"""
    if outer_bracket_pos < 0 or outer_bracket_pos >= len(text):
        return []
    if text[outer_bracket_pos] != "[":
        return []
    results: list[tuple[int, str]] = []
    i = max(scan_from, outer_bracket_pos + 1)
    n = len(text)
    while i < n:
        while i < n and text[i] in " \t\r\n,":
            i += 1
        if i >= n or text[i] == "]":
            break
        if text[i] != "[":
            i += 1
            continue
        inner_start = i
        depth = 0
        in_string = False
        string_char = ""
        escape = False
        j = i
        while j < n:
            ch = text[j]
            if escape:
                escape = False
                j += 1
                continue
            if ch == "\\" and in_string:
                escape = True
                j += 1
                continue
            if not in_string and (ch == '"' or ch == "'"):
                in_string = True
                string_char = ch
                j += 1
                continue
            if in_string:
                if ch == string_char:
                    in_string = False
                j += 1
                continue
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    literal = text[inner_start : j + 1]
                    results.append((j + 1, literal))
                    i = j + 1
                    break
            j += 1
        else:
            break
    return results


def _parse_row_literal(literal: str) -> list[str] | None:
    candidates = [literal]
    normalized = literal.replace("\n", " ").strip()
    if normalized != literal:
        candidates.append(normalized)
    sanitized = _normalize_ai_list_literal(literal)
    if sanitized not in candidates:
        candidates.append(sanitized)
    sanitized_flat = sanitized.replace("\n", " ").strip()
    if sanitized_flat not in candidates:
        candidates.append(sanitized_flat)
    for candidate in candidates:
        parsed = None
        try:
            parsed = ast.literal_eval(candidate)
        except (SyntaxError, ValueError):
            try:
                parsed = json.loads(candidate)
            except (json.JSONDecodeError, TypeError, ValueError):
                continue
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if isinstance(item, (list, dict, tuple)):
                break
        else:
            return [str(x if x is not None else "") for x in parsed]
    return None


def _normalize_row(row: list[str], columns_count: int | None) -> list[str]:
    if columns_count is None:
        return row
    n = columns_count
    if len(row) < n:
        return row + [""] * (n - len(row))
    if len(row) > n:
        return row[:n]
    return row


def _is_placeholder_row(row: list[str]) -> bool:
    """过滤思考/提示词中的占位示例行（如 字段1、...）。"""
    if not row:
        return True
    for cell in row:
        c = str(cell or "").strip()
        if not c:
            continue
        if re.match(r"^字段\d+$", c):
            return True
        if c in ("...", "…", "字段1", "字段2"):
            return True
    joined = " ".join(str(c or "").strip() for c in row)
    if re.search(r"\[\[|\]\]|test_cases\s*=", joined, re.I):
        return True
    return False


def _filter_valid_rows(rows: list[list[str]]) -> list[list[str]]:
    return [row for row in rows if not _is_placeholder_row(row)]


def extract_list_parseable_text(text: str) -> str:
    """从混合 thinking + 列表输出中提取最终 test_cases 片段（忽略思考中的示例）。"""
    raw = str(text or "")
    if not raw.strip():
        return raw

    blocks = re.findall(
        r"```(?:python|json|javascript|js|txt|text|plaintext|markdown)?\s*([\s\S]*?)```",
        raw,
        flags=re.IGNORECASE,
    )
    tc_blocks = [b.strip() for b in blocks if re.search(r"test_cases\s*=|\[\s*\[", b)]
    if tc_blocks:
        return tc_blocks[-1]

    matches = list(re.finditer(r"(?:^|\n)\s*test_cases\s*=", raw, re.MULTILINE))
    if matches:
        return raw[matches[-1].start() :].strip()

    if re.search(r"Here'?s a thinking process:", raw, re.I):
        tail_markers = [
            r"\[Done\]",
            r"Output matches exactly",
            r"Proceeds to output",
            r"Proceeds\.\s*$",
            r"\*\*\[Output Generation\]\*\*",
        ]
        for pat in tail_markers:
            m = re.search(pat, raw, re.I | re.MULTILINE)
            if m:
                tail = raw[m.end() :].strip()
                if tail and tail != raw:
                    nested = extract_list_parseable_text(tail)
                    if nested.strip():
                        return nested

    return raw


def parse_rows_from_text(text: str, columns_count: int | None = None) -> list[list[str]]:
    """全量解析（与流式完成后校验一致）。"""
    text = extract_list_parseable_text(text)
    cleaned = _strip_prefix(text)
    outer = _find_outer_list_start(cleaned)
    if outer == -1:
        return []
    arrays = _extract_complete_row_arrays(cleaned, outer, outer + 1)
    rows: list[list[str]] = []
    for _, literal in arrays:
        row = _parse_row_literal(literal)
        if row is None:
            continue
        row = _normalize_row(row, columns_count)
        if _is_placeholder_row(row):
            continue
        rows.append(row)
    return rows


def _column_index(columns: list[str] | None, keyword: str, default: int) -> int:
    if not columns:
        return default
    for i, col in enumerate(columns):
        if keyword in str(col or ""):
            return i
    return default


def parse_list_rows_from_text(
    text: str,
    *,
    columns: list[str] | None = None,
    columns_count: int | None = None,
) -> list[list[str]]:
    """列表模式全量解析：优先 test_cases 数组，兜底 TC: 要素分类法（与同步 JS 一致）。"""
    n = columns_count
    if n is None and columns:
        n = len(columns)
    rows = parse_rows_from_text(text, n)
    if rows:
        return rows
    if not re.search(r"TC\s*[:：]", str(text or ""), re.IGNORECASE):
        return []
    name_col = _column_index(columns, "用例名称", 0)
    mod_col = _column_index(columns, "所属模块", 1)
    ncol = n or max(name_col, mod_col) + 1
    outline = _OutlineMindmapParser(name_col=name_col, module_col=mod_col, n_cols=ncol)
    outline_rows: list[list[str]] = []
    for line in str(text or "").splitlines():
        outline_rows.extend(outline.feed(line + "\n"))
    return outline_rows


def parse_mindmap_rows_from_text(text: str, columns_count: int | None = None) -> list[list[str]]:
    """导图模式全量解析（JSON 数组 + TC: 层级文本）。"""
    parser = IncrementalMindmapParser(columns_count=columns_count)
    cleaned = extract_mindmap_parseable_text(str(text or ""))
    return parser.feed(cleaned)


class IncrementalCaseParser:
    """流式累积 buffer，增量产出完整行。"""

    def __init__(self, columns_count: int | None = None) -> None:
        self.columns_count = columns_count
        self._buffer = ""
        self._parsed_end = 0
        self._total_parsed = 0

    @property
    def parsed_count(self) -> int:
        return self._total_parsed

    def feed(self, delta: str) -> list[list[str]]:
        if not delta:
            return []
        self._buffer += delta
        parseable = extract_list_parseable_text(self._buffer)
        all_rows = parse_rows_from_text(parseable, self.columns_count)
        prev = self._total_parsed
        if len(all_rows) < prev:
            prev = 0
            self._total_parsed = 0
        new_rows = all_rows[prev:]
        self._total_parsed = len(all_rows)
        return new_rows



def _outline_indent_level(line: str) -> int:
    m = re.match(r"^(\s*)", line)
    lead = m.group(1) if m else ""
    col = sum(4 if ch == "\t" else 1 for ch in lead)
    if col <= 0:
        return 0
    return col // 4


_RE_MINDMAP_THINKING_HEAD = re.compile(
    r"^(?:Here'?s a thinking process:|\*\*Analyze User Input:\*\*|Self-Correction|Output Generation|Proceeds\.?$|\[\s*Output Generation\s*\]|Final Output Generation|\[Done\])",
    re.I,
)

_RE_MINDMAP_NOISE = re.compile(
    r"\b(the prompt says|It might be that|extremely specific|user actually wants|I will generate|I'll stick|Wait,|Let's re-read|Given the|To be safe)\b",
    re.I,
)


def _line_indent_cols(line: str) -> int:
    m = re.match(r"^(\s*)", str(line or ""))
    lead = m.group(1) if m else ""
    return sum(4 if ch == "\t" else 1 for ch in lead)


def _is_mindmap_noise_line(stripped: str) -> bool:
    text = str(stripped or "").strip()
    if not text:
        return False
    if _RE_MINDMAP_THINKING_HEAD.match(text):
        return True
    if _RE_MINDMAP_NOISE.search(text):
        return True
    if re.match(
        r"^(?:Wait|Let'?s|Actually|However|Maybe|Given |Check |Structure:|Level \d|I will|This is|Proceeds|"
        r"Self-Correction|All constraints|Matches\.|Ready\.|Note:|One detail:|\*\*Input \d)",
        text,
        re.I,
    ):
        return True
    letters = len(re.findall(r"[A-Za-z]", text))
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
    if letters >= 24 and chinese <= 12:
        return True
    if len(text) > 60 and letters > max(1, chinese) * 3:
        return True
    return False


def _is_mindmap_object_title(stripped: str) -> bool:
    clean = str(stripped or "").replace("**", "").strip()
    if not clean or _is_mindmap_noise_line(clean):
        return False
    if not re.search(r"[\u4e00-\u9fff]", clean):
        return False
    if re.search(r"[A-Za-z]{3,}", clean):
        return False
    if "**" in str(stripped or "") and re.search(r"[\u4e00-\u9fff]+-[\u4e00-\u9fff]+", clean):
        return False
    return bool(re.search(r"(?:功能|模块|场景)$", clean)) and 2 <= len(clean) <= 36


def _is_mindmap_root_line(line: str) -> bool:
    stripped = str(line or "").strip()
    cols = _line_indent_cols(line)
    if cols not in (0, 4):
        return False
    return _is_mindmap_object_title(stripped)


def _is_mindmap_outline_line(line: str) -> bool:
    stripped = str(line or "").strip()
    if not stripped or _is_mindmap_noise_line(stripped):
        return False
    cols = _line_indent_cols(line)
    if re.match(r"^\s{8,}TC\s*[:：]", line, re.I):
        case_name = re.sub(r"^\s{8,}TC\s*[:：]\s*", "", line, flags=re.I).strip()
        return bool(case_name) and not _is_mindmap_noise_line(case_name)
    if cols == 0 or (cols == 4 and _is_mindmap_object_title(stripped)):
        return _is_mindmap_root_line(line)
    if cols == 4:
        if _is_mindmap_object_title(stripped):
            return True
        inner = stripped.replace("**", "").strip()
        return bool(re.search(r"[\u4e00-\u9fff]", inner)) and not re.search(r"[A-Za-z]{4,}", inner)
    if cols == 8:
        return bool(re.search(r"[\u4e00-\u9fff]", stripped)) and not re.search(r"[A-Za-z]{4,}", stripped)
    return False


def extract_mindmap_parseable_text(text: str) -> str:
    """从混合 thinking + 导图层级文本中提取可解析片段（取 TC 最多的有效块）。"""
    raw = str(text or "")
    if not raw.strip():
        return raw
    if not re.search(r"TC\s*[:：]", raw, re.I):
        return raw

    lines = raw.splitlines()
    blocks: list[list[str]] = []
    current: list[str] = []

    def flush_block() -> None:
        nonlocal current
        if current and any(re.search(r"TC\s*[:：]", ln, re.I) for ln in current):
            blocks.append(current)
        current = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                current.append(line)
            continue
        if _is_mindmap_root_line(line) and current:
            flush_block()
        if _is_mindmap_outline_line(line):
            current.append(line)
        elif current and _is_mindmap_noise_line(stripped):
            flush_block()
    flush_block()

    if not blocks:
        kept = [ln for ln in lines if _is_mindmap_outline_line(ln)]
        if kept and any(re.search(r"TC\s*[:：]", ln, re.I) for ln in kept):
            blocks = [kept]

    if not blocks:
        return raw

    best = blocks[0]
    best_key = (-1, -1)
    for i, block in enumerate(blocks):
        tc_n = sum(1 for ln in block if re.search(r"TC\s*[:：]", ln, re.I))
        key = (tc_n, i)
        if key > best_key:
            best_key = key
            best = block
    out = "\n".join(ln for ln in best if ln.strip())
    if out and not out.endswith("\n"):
        out += "\n"
    return out


def _clean_outline_title(line: str) -> str:
    text = re.sub(r"^\s*[-*+]\s+", "", str(line or ""))
    return text.replace("**", "").strip()


class _OutlineMindmapParser:
    """增量解析导图 TC: 行（缩进层级 + TC: 用例名）。"""

    def __init__(self, *, name_col: int = 0, module_col: int = 1, n_cols: int = 2) -> None:
        self.name_col = name_col
        self.module_col = module_col
        self.n_cols = max(n_cols, 2)
        self._buffer = ""
        self._path_stack: list[str] = ["测试用例"]
        self._parsed_count = 0

    @property
    def parsed_count(self) -> int:
        return self._parsed_count

    def feed(self, delta: str) -> list[list[str]]:
        if not delta:
            return []
        self._buffer += delta
        rows: list[list[str]] = []
        while True:
            idx = self._buffer.find("\n")
            if idx < 0:
                break
            line = self._buffer[:idx]
            self._buffer = self._buffer[idx + 1 :]
            row = self._parse_line(line)
            if row is not None:
                rows.append(row)
        return rows

    def _parse_line(self, raw_line: str) -> list[str] | None:
        if not str(raw_line).strip():
            return None
        level = _outline_indent_level(raw_line)
        content = _clean_outline_title(raw_line)
        if not content or _is_mindmap_noise_line(content):
            return None
        tc_match = re.match(r"^TC\s*[:：]\s*(.+)$", content, re.IGNORECASE)
        if tc_match:
            case_name = tc_match.group(1).strip()
            if not case_name or _is_mindmap_noise_line(case_name):
                return None
            module_parts = self._path_stack[1:] if len(self._path_stack) > 1 else []
            row = [""] * self.n_cols
            row[self.name_col] = case_name
            row[self.module_col] = " / ".join(module_parts) if module_parts else "未分类"
            self._parsed_count += 1
            return _normalize_row(row, self.n_cols)
        if re.match(r"^测试用例$", content, re.IGNORECASE):
            self._path_stack = ["测试用例"]
            return None
        embedded = [p.strip() for p in content.split("/") if p.strip()]
        if len(embedded) > 1:
            self._path_stack = ["测试用例"] + embedded
            return None
        if level <= 0 and not _is_mindmap_root_line(raw_line) and re.search(r"[A-Za-z]{3,}", content):
            return None
        if level == 1 and _is_mindmap_object_title(content):
            branch_level = 1
        else:
            branch_level = 1 if level <= 0 else level + 1
        branch_level = min(branch_level, 48)
        while len(self._path_stack) <= branch_level:
            self._path_stack.append("")
        self._path_stack[branch_level] = content
        self._path_stack = self._path_stack[: branch_level + 1]
        if self._path_stack[0] != "测试用例":
            self._path_stack.insert(0, "测试用例")
        return None


class IncrementalMindmapParser:
    """导图模式：同时支持 test_cases JSON 与 TC: 层级文本。"""

    def __init__(self, columns_count: int | None = None) -> None:
        n = columns_count or 2
        self._list_parser = IncrementalCaseParser(columns_count)
        self._outline_parser = _OutlineMindmapParser(n_cols=n)

    @property
    def parsed_count(self) -> int:
        return self._list_parser.parsed_count + self._outline_parser.parsed_count

    def feed(self, delta: str) -> list[list[str]]:
        rows: list[list[str]] = []
        rows.extend(self._list_parser.feed(delta))
        rows.extend(self._outline_parser.feed(delta))
        return rows

