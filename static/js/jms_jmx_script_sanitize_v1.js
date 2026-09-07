/**
 * JMX 导出前 · 脚本字段清洗（去除 YAML 尾部 "\ " 污染）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function sanitizeScriptText(s) {
        if (s == null) return '';
        var t = String(s);
        t = t.replace(/\s+\\\s*$/g, '');
        t = t.replace(/\\[\s]*$/g, '');
        return t;
    }

    function walk(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
        }
        Object.keys(obj).forEach(function (k) {
            if ((k === 'script' || k === 'query' || k === 'initScript') && typeof obj[k] === 'string') {
                obj[k] = sanitizeScriptText(obj[k]);
            } else if (obj[k] && typeof obj[k] === 'object') {
                walk(obj[k]);
            }
        });
    }

    function sanitizeScenario(data) {
        if (!data || typeof data !== 'object') return data;
        var out = clone(data);
        walk(out);
        return out;
    }

    global.JmsJmxScriptSanitizeV1 = {
        sanitizeScriptText: sanitizeScriptText,
        sanitizeScenario: sanitizeScenario
    };
})(typeof window !== 'undefined' ? window : this);
