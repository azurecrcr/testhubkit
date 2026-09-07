/**
 * HTTP 步骤 · 用户参数配置目录（隔离模块）
 */
(function (global) {
    'use strict';

    function defaultUserParams() {
        return {
            enabled: false,
            name: '用户参数',
            comments: '',
            per_iteration: false,
            params: []
        };
    }

    function getUserCount(params) {
        var n = 1;
        (params || []).forEach(function (p) {
            if (!p) return;
            var len = 0;
            if (Array.isArray(p.values)) len = p.values.length;
            else if (p.value !== undefined) len = 1;
            if (len > n) n = len;
        });
        return Math.max(1, n);
    }

    /** 编辑态归一化：保留空变量名行，供弹窗工具栏增删/排序 */
    function normalizeDraftParams(cfg) {
        cfg = cfg && typeof cfg === 'object' ? cfg : {};
        var raw = Array.isArray(cfg.params) ? cfg.params : [];
        var userCount = cfg.user_count != null ? Math.max(1, parseInt(cfg.user_count, 10) || 1) : getUserCount(raw);
        raw.forEach(function (p) {
            if (!p) return;
            var len = Array.isArray(p.values) ? p.values.length : (p.value !== undefined ? 1 : 0);
            if (len > userCount) userCount = len;
        });
        userCount = Math.max(1, userCount);
        var params = raw.map(function (p) {
            if (!p || typeof p !== 'object') {
                return { key: '', values: Array(userCount).fill('') };
            }
            var key = p.key != null ? String(p.key) : (p.name != null ? String(p.name) : '');
            var values = [];
            if (Array.isArray(p.values)) {
                p.values.forEach(function (v) { values.push(v == null ? '' : String(v)); });
            } else if (p.value !== undefined) {
                values.push(String(p.value));
            }
            while (values.length < userCount) values.push('');
            if (values.length > userCount) values = values.slice(0, userCount);
            return { key: key, values: values };
        });
        return {
            enabled: !!cfg.enabled,
            name: cfg.name ? String(cfg.name) : '用户参数',
            comments: cfg.comments != null ? String(cfg.comments) : '',
            per_iteration: !!cfg.per_iteration,
            params: params,
            user_count: userCount
        };
    }

    function normalizeParams(cfg) {
        cfg = cfg && typeof cfg === 'object' ? cfg : {};
        var raw = Array.isArray(cfg.params) ? cfg.params : [];
        var params = [];
        raw.forEach(function (p) {
            if (!p || typeof p !== 'object') return;
            var key = String(p.key || p.name || '').trim();
            if (!key) return;
            var values = [];
            if (Array.isArray(p.values)) {
                p.values.forEach(function (v) { values.push(v == null ? '' : String(v)); });
            } else if (p.value !== undefined) {
                values.push(String(p.value));
            } else {
                values.push('');
            }
            params.push({ key: key, values: values });
        });
        var userCount = getUserCount(params);
        params.forEach(function (p) {
            while (p.values.length < userCount) p.values.push('');
        });
        return {
            enabled: !!cfg.enabled,
            name: cfg.name ? String(cfg.name) : '用户参数',
            comments: cfg.comments != null ? String(cfg.comments) : '',
            per_iteration: !!cfg.per_iteration,
            params: params,
            user_count: userCount
        };
    }

    function toStorageModel(norm) {
        norm = normalizeParams(norm);
        var params = norm.params.map(function (p) {
            if (norm.user_count <= 1) {
                return { key: p.key, value: p.values[0] || '' };
            }
            return { key: p.key, values: p.values.slice() };
        });
        return {
            enabled: norm.enabled,
            name: norm.name,
            comments: norm.comments,
            per_iteration: norm.per_iteration,
            params: params
        };
    }

    global.JmsHttpStepUserParamsCatalog = {
        defaultUserParams: defaultUserParams,
        normalizeParams: normalizeParams,
        normalizeDraftParams: normalizeDraftParams,
        toStorageModel: toStorageModel,
        getUserCount: getUserCount
    };
}(typeof window !== 'undefined' ? window : this));
