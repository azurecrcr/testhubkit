/**
 * 文档工具 · AI 响应解析（与 smart_edit / tc_workbench 完全隔离）
 */
(function () {
    'use strict';

    function extractJsonObject(text) {
        var raw = String(text || '').trim();
        if (!raw) throw new Error('AI 返回为空');
        var fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence && fence[1]) raw = fence[1].trim();
        try {
            var direct = JSON.parse(raw);
            if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct;
        } catch (e1) { /* ignore */ }
        var start = raw.indexOf('{');
        var end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                var sliced = JSON.parse(raw.slice(start, end + 1));
                if (sliced && typeof sliced === 'object' && !Array.isArray(sliced)) return sliced;
            } catch (e2) {
                throw new Error('AI 返回不是合法 JSON');
            }
        }
        throw new Error('无法从 AI 响应中解析 JSON 对象');
    }

    function normalizeMatrix(matrix) {
        if (!Array.isArray(matrix) || !matrix.length) {
            throw new Error('matrix 必须是非空二维数组');
        }
        var rows = [];
        var colCount = 0;
        for (var i = 0; i < matrix.length; i += 1) {
            var row = matrix[i];
            if (!Array.isArray(row)) throw new Error('matrix[' + i + '] 必须是数组');
            var line = row.map(function (cell) { return cell == null ? '' : String(cell); });
            if (!colCount) colCount = line.length;
            else if (line.length !== colCount) {
                throw new Error('matrix 每行列数必须一致');
            }
            rows.push(line);
        }
        if (!colCount) throw new Error('matrix 列数不能为 0');
        return rows;
    }

    function parseDocToolsAiResponse(text) {
        var data = extractJsonObject(text);
        if (!data || !Object.prototype.hasOwnProperty.call(data, 'matrix')) {
            throw new Error('AI 响应缺少必填字段 matrix');
        }
        return {
            summary: String(data.summary || '').trim() || '已完成智能编辑',
            matrix: normalizeMatrix(data.matrix)
        };
    }

    function validateMatrixAgainstSource(matrix, sourceMatrix) {
        var normalized = normalizeMatrix(matrix);
        if (!Array.isArray(sourceMatrix) || !sourceMatrix.length) return normalized;
        var source;
        try {
            source = normalizeMatrix(sourceMatrix);
        } catch (e) {
            return normalized;
        }
        if (!source.length) return normalized;
        if (normalized[0].length !== source[0].length) {
            throw new Error('AI 返回列数与当前表格不一致，请重试');
        }
        return normalized;
    }

    globalThis.DocToolsAiResponse = {
        parse: parseDocToolsAiResponse,
        normalizeMatrix: normalizeMatrix,
        validateMatrixAgainstSource: validateMatrixAgainstSource
    };
})();
