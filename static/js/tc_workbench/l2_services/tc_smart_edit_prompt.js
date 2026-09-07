/**
 * 智能编辑 — 系统提示词（前端预览用，实际约束由后端兜底拼接）
 */
(function (global) {
    'use strict';

    var SYSTEM_PROMPT = '【系统约束 — 智能编辑助手】\n'
        + '你是测试用例表格编辑助手。你将收到表格表头（列定义 columns）、当前表格数据快照和用户编辑指令。\n\n'
        + '## 表头与数据格式（必读）\n'
        + '- columns 是表格表头；cells 的 key 必须与 columns 列名完全一致\n'
        + '- 每条 add 追加一行；新增 N 行须输出 N 条 add\n\n'
        + '## 允许的操作\n'
        + '- update：修改已有行的指定单元格\n'
        + '- add：在表格末尾追加新行（可多条）\n\n'
        + '## 禁止的操作\n'
        + '- 禁止 delete、禁止清空整行\n'
        + '- 禁止修改 columns 表头、禁止自造列名\n\n'
        + '## 输出格式\n'
        + '严格 JSON：{ "summary": "...", "operations": [...] }';

    function formatColumnsBlock(columns) {
        return (columns || []).map(function (col, i) {
            return (i + 1) + '. ' + col;
        }).join('\n') || '（无）';
    }

    function buildEditPromptPreview(userPrompt, tableSnapshot) {
        var snap = tableSnapshot || {};
        var columns = snap.columns || [];
        return SYSTEM_PROMPT
            + '\n\n【表格表头 columns（cells 的 key 必须且仅能使用以下列名）】\n'
            + formatColumnsBlock(columns)
            + '\n\n【当前表格数据快照】\n'
            + JSON.stringify(snap, null, 2)
            + '\n\n【用户编辑指令】\n'
            + String(userPrompt || '').trim();
    }

    global.TcSmartEditPrompt = {
        SYSTEM_PROMPT: SYSTEM_PROMPT,
        buildEditPromptPreview: buildEditPromptPreview
    };
})(typeof window !== 'undefined' ? window : this);
