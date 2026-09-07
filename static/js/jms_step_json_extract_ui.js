/**
 * 压测造数 · HTTP 步骤 JSON 提取器展示（与 jms_tg_tree_renderer 隔离耦合）
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeStepExtractors(step) {
        if (global.JmsJsonPostExtractSync &&
            typeof global.JmsJsonPostExtractSync.normalizeExtractorsForDisplay === 'function') {
            return global.JmsJsonPostExtractSync.normalizeExtractorsForDisplay(step);
        }
        var list = [];
        if (!step || typeof step !== 'object') return list;
        if (Array.isArray(step.extractors)) {
            step.extractors.forEach(function (ex) {
                if (!ex || !ex.var || !ex.json_path) return;
                list.push({
                    var: String(ex.var).trim(),
                    json_path: String(ex.json_path).trim()
                });
            });
        }
        if (!list.length) {
            var v = step.extract_var != null ? String(step.extract_var).trim() : '';
            var p = step.extract_json_path != null ? String(step.extract_json_path).trim() : '';
            if (v && p) list.push({ var: v, json_path: p });
        }
        return list;
    }

    /** 树形行内徽章：仅变量名，置于断言徽章之后 */
    function renderInlineBadge(step) {
        var list = normalizeStepExtractors(step);
        if (!list.length) return '';
        var title = list.map(function (ex) {
            return ex.var + ' ← ' + ex.json_path;
        }).join('\n');
        var label = list.map(function (ex) { return ex.var; }).join(', ');
        return '<span class="jms-http-extract-inline" title="' + esc(title) + '">' + esc(label) + '</span>';
    }

    /** 保留 API，树形视图不再渲染底部展开块 */
    function renderHttpExtractBlock() {
        return '';
    }

    global.JmsStepJsonExtractUi = {
        normalizeStepExtractors: normalizeStepExtractors,
        renderHttpExtractBlock: renderHttpExtractBlock,
        renderInlineBadge: renderInlineBadge,
        hasExtractors: function (step) {
            return normalizeStepExtractors(step).length > 0;
        }
    };
})(typeof window !== 'undefined' ? window : this);
