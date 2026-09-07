/**
 * JMeter AI 面板 · StepTree operations 解析与结果格式化（独立模块）
 */
(function (global) {
    'use strict';

    var ACTION_LABELS = { add: '新增', update: '更新', replace: '替换' };
    var KIND_LABELS = {
        step: '步骤', assert: '断言', config: '配置', processor: '后置处理器',
        listener: '监听器', tg_variables: '变量'
    };

    function normalizeOperation(op, index) {
        if (!op || typeof op !== 'object') {
            throw new Error('operations[' + index + '] 无效');
        }
        var action = String(op.action || '').toLowerCase();
        if (action !== 'add' && action !== 'update' && action !== 'replace') {
            throw new Error('operations[' + index + '] action 无效: ' + action);
        }
        var out = {
            action: action,
            kind: String(op.kind || 'step').toLowerCase(),
            component: op.component || op.data || op.step || {}
        };
        if (op.scope) out.scope = String(op.scope);
        if (op.target_name || op.targetName) out.target_name = String(op.target_name || op.targetName);
        if (op.ref_id || op.refId) out.ref_id = String(op.ref_id || op.refId);
        if (op.parent_ref_id != null || op.parentRefId != null) {
            out.parent_ref_id = op.parent_ref_id != null ? op.parent_ref_id : op.parentRefId;
        }
        var after = op.insert_after_ref_id || op.insertAfterRefId || op.after_ref_id || op.afterRefId;
        if (after) out.insert_after_ref_id = String(after);
        if (op.insert_index != null) out.insert_index = parseInt(op.insert_index, 10);
        if (op.after_index != null) out.after_index = parseInt(op.after_index, 10);
        if (op.listener_key || op.listenerKey) out.listener_key = String(op.listener_key || op.listenerKey);
        return out;
    }

    function parseDoneEvent(event) {
        var summary = String((event && (event.summary || event.content)) || '已完成').trim();
        var rawOps = (event && event.operations) || [];
        var operations = [];
        var warnings = [];
        rawOps.forEach(function (op, i) {
            try {
                operations.push(normalizeOperation(op, i));
            } catch (e) {
                warnings.push((e && e.message) ? e.message : String(e));
            }
        });
        return { summary: summary, operations: operations, warnings: warnings };
    }

    function describeOperation(op) {
        var act = ACTION_LABELS[op.action] || op.action;
        var kind = KIND_LABELS[op.kind] || op.kind;
        var label = op.target_name || op.ref_id || '';
        var scope = op.scope === 'step_tree' ? '嵌套' : (op.scope === 'timeline' ? '顶层' : '');
        var parts = [act + kind];
        if (scope) parts.push('(' + scope + ')');
        if (label) parts.push('「' + label + '」');
        if (op.action === 'add' && op.parent_ref_id) {
            parts.push('parent=' + op.parent_ref_id);
        }
        return parts.join(' ');
    }

    function formatResultMessage(summary, operations, applyResult) {
        var lines = [summary];
        if (operations && operations.length) {
            lines.push('操作明细：');
            operations.forEach(function (op, i) {
                lines.push('  ' + (i + 1) + '. ' + describeOperation(op));
            });
        }
        if (applyResult) {
            var counts = [];
            if (applyResult.added) counts.push('新增 ' + applyResult.added);
            if (applyResult.updated) counts.push('更新 ' + applyResult.updated);
            if (applyResult.replaced) counts.push('替换 ' + applyResult.replaced);
            if (counts.length) lines.push('应用结果：' + counts.join(' · '));
            if (applyResult.errors && applyResult.errors.length) {
                lines.push('部分失败：');
                applyResult.errors.forEach(function (err) {
                    lines.push('  · ' + (err.error || String(err)));
                });
            }
        }
        return lines.join('\n');
    }

    global.JmsJmeterAiPanelOps = {
        parseDoneEvent: parseDoneEvent,
        normalizeOperation: normalizeOperation,
        formatResultMessage: formatResultMessage,
        describeOperation: describeOperation
    };
})(typeof window !== 'undefined' ? window : this);
