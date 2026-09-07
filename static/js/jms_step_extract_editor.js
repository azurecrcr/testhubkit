/**
 * 压测造数 · HTTP 步骤编辑抽屉 · 多 JSON 提取器 UI（与 jmeter_visual_builder 隔离耦合）
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

    function normalizeForEditor(step) {
        if (!step || typeof step !== 'object') return [];
        if (global.JmsStepJsonExtractUi && typeof global.JmsStepJsonExtractUi.normalizeStepExtractors === 'function') {
            return global.JmsStepJsonExtractUi.normalizeStepExtractors(step);
        }
        var list = [];
        if (Array.isArray(step.extractors)) {
            step.extractors.forEach(function (ex) {
                if (!ex || !ex.var || !ex.json_path) return;
                list.push({ var: String(ex.var).trim(), json_path: String(ex.json_path).trim() });
            });
        }
        if (!list.length && step.extract_var && step.extract_json_path) {
            list.push({
                var: String(step.extract_var).trim(),
                json_path: String(step.extract_json_path).trim()
            });
        }
        return list;
    }

    function rowHtml(ex, idx) {
        ex = ex || {};
        return '<div class="jms-kv-row jms-extract-row" data-extract-index="' + idx + '">' +
            '<input type="text" class="jms-extract-path hf-mono" placeholder="JSON 路径 $.token" value="' + esc(ex.json_path || '') + '" />' +
            '<input type="text" class="jms-extract-var hf-mono" placeholder="变量名 token" value="' + esc(ex.var || '') + '" />' +
            '<button type="button" class="jms-kv-del" title="删除">×</button></div>';
    }

    function emptyRowHtml() {
        return rowHtml({}, 0);
    }

    function renderList(step) {
        var list = normalizeForEditor(step);
        var html = '';
        list.forEach(function (ex, i) {
            html += rowHtml(ex, i);
        });
        if (!list.length) {
            html += '<p class="jms-empty-hint">暂无提取器，点击「+ 提取」添加</p>';
        }
        return html;
    }

    function readList(listEl) {
        var out = [];
        if (!listEl) return out;
        listEl.querySelectorAll('.jms-extract-row').forEach(function (row) {
            var path = (row.querySelector('.jms-extract-path') && row.querySelector('.jms-extract-path').value || '').trim();
            var varName = (row.querySelector('.jms-extract-var') && row.querySelector('.jms-extract-var').value || '').trim();
            if (!path && !varName) return;
            out.push({ json_path: path, var: varName });
        });
        return out;
    }

    function applyToStep(step, listEl) {
        if (!step) return step;
        var list = readList(listEl);
        step.extractors = list;
        if (list.length) {
            step.extract_var = list[0].var;
            step.extract_json_path = list[0].json_path;
        } else {
            step.extract_var = '';
            step.extract_json_path = '';
        }
        return step;
    }

    function validateExtractors(list, label) {
        label = label || '步骤';
        (list || []).forEach(function (ex, i) {
            var path = (ex.json_path || '').trim();
            var varName = (ex.var || '').trim();
            if ((path && !varName) || (!path && varName)) {
                throw new Error(label + '：JSON 提取第 ' + (i + 1) + ' 项须同时填写路径与变量名');
            }
        });
    }

    function bindEditor() {
        var btn = global.document.getElementById('btn-step-add-extract');
        var list = global.document.getElementById('step-edit-extractors');
        if (!btn || !list || btn._jmsExtractBound) return;
        btn._jmsExtractBound = true;
        btn.addEventListener('click', function () {
            var hint = list.querySelector('.jms-empty-hint');
            if (hint) hint.remove();
            list.insertAdjacentHTML('beforeend', emptyRowHtml());
        });
    }

    global.JmsStepExtractEditor = {
        renderList: renderList,
        readList: readList,
        applyToStep: applyToStep,
        validateExtractors: validateExtractors,
        bindEditor: bindEditor,
        normalizeForEditor: normalizeForEditor
    };
})(typeof window !== 'undefined' ? window : this);
