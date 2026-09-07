/**
 * HTTP path 校验（JMeter 合法写法）· 隔离模块
 * 允许：/path 、 ${BASE_URL|ORIGIN}/… 、 //host/… 、 http(s)://…
 * 不改既有 charAt('/') 强校验调用点以外的逻辑。
 */
(function (global) {
    'use strict';

    function isAcceptableJmeterHttpPath(path) {
        var p = String(path == null ? '' : path).trim();
        if (!p) return false;
        if (p.charAt(0) === '/') return true;
        if (/^https?:\/\//i.test(p)) return true;
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.isHostPrefixedPath === 'function' &&
            global.JmsJmxPathHost.isHostPrefixedPath(p)) {
            return true;
        }
        if (/^\/\/[^/?#]+/.test(p)) return true;
        if (global.JmsJmxPathImport && typeof global.JmsJmxPathImport.hasJmxPathVarPrefix === 'function' &&
            global.JmsJmxPathImport.hasJmxPathVarPrefix(p)) {
            return true;
        }
        // ${VAR}/… 或 ${VAR}（变量本身含路径/主机）
        if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(p)) return true;
        return false;
    }

    function assertJmeterHttpPath(path, label) {
        var p = String(path == null ? '' : path).trim();
        if (!p) throw new Error((label || 'HTTP') + '：path 不能为空');
        if (!isAcceptableJmeterHttpPath(p)) {
            throw new Error((label || 'HTTP') + '：path 须以 / 开头，或使用 ${BASE_URL}/…、//host/…、http(s)://…');
        }
        return p;
    }

    global.JmsHttpPathValidateV1 = {
        isAcceptableJmeterHttpPath: isAcceptableJmeterHttpPath,
        assertJmeterHttpPath: assertJmeterHttpPath
    };
})(typeof window !== 'undefined' ? window : this);
