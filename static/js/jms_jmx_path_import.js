/**
 * JMX 导入/导出路径变量前缀（${BASE_URL} / ${ORIGIN}）· 隔离模块
 */
(function (global) {
    'use strict';

    var VAR_PREFIX_RE = /^\$\{(BASE_URL|ORIGIN)\}/;

    function hasJmxPathVarPrefix(path) {
        return VAR_PREFIX_RE.test(String(path || ''));
    }

    /**
     * JMX 导入：保留 path 中显式的 ${BASE_URL}/ ${ORIGIN}/ 前缀，其余走 legacy 规范化
     */

    function _importHostPrefixedPath(path) {
        return /^\/\/[^/?#]+/.test(String(path || ''));
    }

    function _importCollapsedHostPath(path) {
        return /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(String(path || ''));
    }

    function _importRestoreHostPath(path) {
        path = String(path || '/');
        if (_importHostPrefixedPath(path)) return path;
        if (!_importCollapsedHostPath(path)) return path;
        var m = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        return m ? ('//' + m[1] + '/') : path;
    }

    function normalizeJmxImportedPath(path, variables, legacyNormalize) {
        path = String(path || '/');
        if (global.JmsJmxPathHost && global.JmsJmxPathHost.isHostPrefixedPath(path)) {
            return path;
        }
        if (_importHostPrefixedPath(path)) {
            return path;
        }
        if (hasJmxPathVarPrefix(path)) {
            return path;
        }
        if (typeof legacyNormalize === 'function') {
            path = legacyNormalize(path, variables);
        }
        if (global.JmsJmxPathHost && global.JmsJmxPathHost.isCollapsedHostPath(path)) {
            var split = global.JmsJmxPathHost.splitHostFromPath(path);
            if (split) {
                return global.JmsJmxPathHost.toHostPrefixedPath(split.domain, split.path);
            }
        }
        return _importRestoreHostPath(path);
    }

    /** 导出：path 已含 ${BASE_URL} 时不重复拼接 */
    function _exportRestoreHostPathInline(path) {
        path = String(path || '/');
        if (/^\/\/[^/?#]+/.test(path)) return path;
        var m1 = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m1) return '//' + m1[1] + '/';
        var m2 = path.match(/^\$\{(BASE_URL|ORIGIN)\}\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m2) return '//' + m2[2] + '/';
        return null;
    }

    function resolveExportPathWithBaseUrl(path, useBaseUrlVar) {
        path = String(path || '/');
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.restoreHostPathForJmxExport === 'function') {
            var hostOnly = global.JmsJmxPathHost.restoreHostPathForJmxExport(path, null);
            if (hostOnly) return hostOnly;
        }
        var inlineHost = _exportRestoreHostPathInline(path);
        if (inlineHost) return inlineHost;
        if (hasJmxPathVarPrefix(path)) {
            return path;
        }
        if (!useBaseUrlVar) {
            return path;
        }
        return '${BASE_URL}' + (path.charAt(0) === '/' ? path : '/' + path);
    }

    global.JmsJmxPathImport = {
        hasJmxPathVarPrefix: hasJmxPathVarPrefix,
        normalizeJmxImportedPath: normalizeJmxImportedPath,
        resolveExportPathWithBaseUrl: resolveExportPathWithBaseUrl
    };
}(typeof window !== 'undefined' ? window : this));
