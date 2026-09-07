/**
 * JMX 导出 · HTTP Path 策略检测（隔离模块，本阶段仅自检 warn）
 */
(function (global) {
    'use strict';

    function detectBaseUrlFullPath(jmx) {
        if (!jmx) return [];
        var issues = [];
        var re = /<stringProp name="HTTPSampler\.path">([^<]*)<\/stringProp>/g;
        var m;
        while ((m = re.exec(jmx)) !== null) {
            var path = m[1] || '';
            if (path.indexOf('${BASE_URL}') >= 0 || /^https?:\/\//i.test(path)) {
                issues.push(path.slice(0, 80));
            }
        }
        return issues;
    }

    global.JmsHttpPathExportStrategyV1 = {
        detectBaseUrlFullPath: detectBaseUrlFullPath
    };
}(typeof window !== 'undefined' ? window : this));
