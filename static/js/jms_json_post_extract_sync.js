/**
 * JSON PostProcessor ↔ extractors 展示同步（隔离模块，不影响导出去重逻辑）
 */
(function (global) {
    'use strict';

    function jsonPostToExtractor(proc) {
        if (!proc || proc.type !== 'json_post') return null;
        var varName = proc.var != null ? String(proc.var).trim() : '';
        var jsonPath = proc.json_path != null ? String(proc.json_path).trim() : '';
        if (!varName || !jsonPath) return null;
        var ex = { var: varName, json_path: jsonPath };
        if (proc.match_numbers !== undefined && String(proc.match_numbers) !== '0') {
            ex.match_numbers = String(proc.match_numbers);
        }
        if (proc.default_value !== undefined && String(proc.default_value) !== '') {
            ex.default_value = String(proc.default_value);
        }
        return ex;
    }

    function collectJsonPostExtractors(step) {
        var list = [];
        if (!step || !Array.isArray(step.processors)) return list;
        step.processors.forEach(function (p) {
            var ex = jsonPostToExtractor(p);
            if (ex) list.push(ex);
        });
        return list;
    }

    /** 导入/YAML 加载后：将 json_post 后置处理器镜像到 extractors 供 UI 展示 */
    function syncExtractorsFromJsonPostProcessors(step) {
        if (!step || typeof step !== 'object') return step;
        var fromProc = collectJsonPostExtractors(step);
        if (!fromProc.length) return step;

        var existing = Array.isArray(step.extractors) ? step.extractors.slice() : [];
        var seen = {};
        existing.forEach(function (ex) {
            if (ex && ex.var) seen[String(ex.var).trim()] = true;
        });
        fromProc.forEach(function (ex) {
            if (seen[ex.var]) return;
            seen[ex.var] = true;
            existing.push(ex);
        });
        step.extractors = existing;
        if (existing.length) {
            step.extract_var = existing[0].var;
            step.extract_json_path = existing[0].json_path;
            step.extract = { var: existing[0].var, json_path: existing[0].json_path };
        }
        return step;
    }

    /** 只读合并 extractors 与 json_post processors，供行内徽章/编辑抽屉 */
    function normalizeExtractorsForDisplay(step) {
        var list = [];
        var seen = {};
        if (!step || typeof step !== 'object') return list;

        function push(ex) {
            if (!ex || !ex.var || !ex.json_path) return;
            var v = String(ex.var).trim();
            if (seen[v]) return;
            seen[v] = true;
            list.push({ var: v, json_path: String(ex.json_path).trim() });
        }

        if (Array.isArray(step.extractors)) step.extractors.forEach(push);
        collectJsonPostExtractors(step).forEach(push);
        if (!list.length) {
            var v = step.extract_var != null ? String(step.extract_var).trim() : '';
            var p = step.extract_json_path != null ? String(step.extract_json_path).trim() : '';
            if (v && p) list.push({ var: v, json_path: p });
        }
        return list;
    }

    global.JmsJsonPostExtractSync = {
        jsonPostToExtractor: jsonPostToExtractor,
        collectJsonPostExtractors: collectJsonPostExtractors,
        syncExtractorsFromJsonPostProcessors: syncExtractorsFromJsonPostProcessors,
        normalizeExtractorsForDisplay: normalizeExtractorsForDisplay
    };
}(typeof window !== 'undefined' ? window : this));
