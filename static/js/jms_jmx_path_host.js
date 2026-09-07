/**
 * JMeter path 中嵌入主机名（//host/ 或误折叠的 /host/）· 导入/导出隔离模块
 */
(function (global) {
    'use strict';

    /** JMeter 常见写法：//host/ 或 //host/path */
    function isHostPrefixedPath(path) {
        return /^\/\/[^/?#]+/.test(String(path || ''));
    }

    /** normalizeImportedPath 误折叠后的 /host/（仅单段域名） */
    function isCollapsedHostPath(path) {
        var p = String(path || '');
        return /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(p);
    }

    function splitHostFromPath(path) {
        path = String(path || '/');
        var m = path.match(/^\/\/([^/?#]+)(\/.*)?$/);
        if (m) {
            return { domain: m[1], path: m[2] || '/' };
        }
        m = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m) {
            return { domain: m[1], path: '/' };
        }
        return null;
    }

    function toHostPrefixedPath(domain, subPath) {
        if (!domain) return null;
        var p = subPath === undefined || subPath === null || subPath === '' ? '/' : String(subPath);
        if (p.charAt(0) !== '/') p = '/' + p;
        if (p === '/') return '//' + domain + '/';
        return '//' + domain + p;
    }

    function stepHttpDefaultsActive(step) {
        if (!step || !step.http_managers) return false;
        var Catalog = global.JmsHttpStepConfigCatalog;
        if (Catalog && typeof Catalog.typeActive === 'function') {
            return Catalog.typeActive(step.http_managers, 'http_defaults');
        }
        var hd = step.http_managers.http_defaults;
        return !!(hd && hd.enabled && hd.domain);
    }

    /** 导出：步骤级 http_defaults 含 domain 且 path 为根时，还原 //host/ 形式 */
    function formatExportPathWithHost(step, pathMerged) {
        if (!step) return null;
        pathMerged = pathMerged === undefined || pathMerged === null ? '' : String(pathMerged);
        if (isHostPrefixedPath(pathMerged)) return pathMerged;

        if (!stepHttpDefaultsActive(step)) return null;
        var hd = step.http_managers.http_defaults;
        if (!hd || !hd.domain) return null;

        var sub = pathMerged || '/';
        var hdPath = hd.path !== undefined && hd.path !== null ? String(hd.path) : '';
        if (hdPath && hdPath !== '/' && sub === '/') {
            sub = hdPath.charAt(0) === '/' ? hdPath : '/' + hdPath;
        }
        if (sub.indexOf('?') >= 0) return null;
        if (sub === '/' || sub === '') {
            return toHostPrefixedPath(hd.domain, '/');
        }
        if (sub.charAt(0) === '/' && sub.indexOf('://') < 0 && !/^\$\{/.test(sub)) {
            return toHostPrefixedPath(hd.domain, sub);
        }
        return null;
    }

    function shouldPreserveHostPathDisplay(path) {
        return isHostPrefixedPath(path) || isCollapsedHostPath(path);
    }

    /** JMX 导入/YAML 载入：将 //host/ 或 /host/ 统一还原为 //host/ 显示，不拆分到 http_defaults */
    function repairHostPathForImportDisplay(step) {
        if (!step || typeof step !== 'object') return step;
        var path = String(step.path || '');
        if (!shouldPreserveHostPathDisplay(path)) return step;
        var split = splitHostFromPath(path);
        if (split) {
            step.path = toHostPrefixedPath(split.domain, split.path);
        }
        return step;
    }

    /** 场景 YAML 载入/系统进入时：修复误折叠的 /host/ -> //host/ */
    function repairStepHostPathOnLoad(step) {
        if (!step || typeof step !== 'object') return step;
        return repairHostPathForImportDisplay(step);
    }

    /** JMX 导出：还原 //host/，避免被 ${BASE_URL} 拼成 ${BASE_URL}/host/ */
    function restoreHostPathForJmxExport(path, step) {
        path = String(path || '/');
        if (isHostPrefixedPath(path)) return path;
        if (isCollapsedHostPath(path)) {
            var splitCollapsed = splitHostFromPath(path);
            if (splitCollapsed) return toHostPrefixedPath(splitCollapsed.domain, splitCollapsed.path);
        }
        var baseVar = path.match(/^\$\{(BASE_URL|ORIGIN)\}\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (baseVar) return '//' + baseVar[2] + '/';
        if (step && typeof step === 'object') {
            var fromDefaults = formatExportPathWithHost(step, path);
            if (fromDefaults) return fromDefaults;
        }
        return null;
    }

    function quoteHostPathsInYaml(yamlText) {
        if (!yamlText) return yamlText;
        return yamlText.replace(/^(\s+path:\s+)(\/\/[^\s#]+)(\s*)$/gm, function (_, indent, val, tail) {
            if (val.indexOf('"') >= 0) return indent + val + tail;
            return indent + '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' + tail;
        });
    }

    function walkScenarioSteps(nodes, fn) {
        (nodes || []).forEach(function (st) {
            if (!st || typeof st !== 'object') return;
            if (st.method && st.path !== undefined) fn(st);
            if (Array.isArray(st.children)) walkScenarioSteps(st.children, fn);
        });
    }

    function repairHostPathsInScenarioObject(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        function repairTg(tg) {
            if (!tg) return;
            walkScenarioSteps(tg.steps, repairHostPathForImportDisplay);
        }
        (scenario.thread_groups || []).forEach(repairTg);
        (scenario.setup_thread_groups || []).forEach(repairTg);
        (scenario.post_thread_groups || []).forEach(repairTg);
        (scenario.test_plans || []).forEach(function (plan) {
            (plan.thread_groups || []).forEach(repairTg);
            walkScenarioSteps(plan.steps, repairHostPathForImportDisplay);
        });
        walkScenarioSteps(scenario.steps, repairHostPathForImportDisplay);
        return scenario;
    }

    global.JmsJmxPathHost = {
        isHostPrefixedPath: isHostPrefixedPath,
        isCollapsedHostPath: isCollapsedHostPath,
        splitHostFromPath: splitHostFromPath,
        toHostPrefixedPath: toHostPrefixedPath,
        formatExportPathWithHost: formatExportPathWithHost,
        stepHttpDefaultsActive: stepHttpDefaultsActive,
        shouldPreserveHostPathDisplay: shouldPreserveHostPathDisplay,
        repairHostPathForImportDisplay: repairHostPathForImportDisplay,
        repairStepHostPathOnLoad: repairStepHostPathOnLoad,
        quoteHostPathsInYaml: quoteHostPathsInYaml,
        repairHostPathsInScenarioObject: repairHostPathsInScenarioObject,
        restoreHostPathForJmxExport: restoreHostPathForJmxExport
    };
}(typeof window !== 'undefined' ? window : this));
