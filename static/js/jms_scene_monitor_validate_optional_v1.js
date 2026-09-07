/**
 * 场景与监控面板已移除：根级 base_url / env / influx 不再作为强制校验项。
 * 独立模块 — 不改既有 parseBaseUrl / parseBaseUrlSimple / validateScenario。
 */
(function (global) {
    'use strict';

    function isSceneMonitorUiPresent() {
        try {
            return !!(document.getElementById('btn-scene-monitor') ||
                document.getElementById('modal-scene-monitor') ||
                document.getElementById('scene-base-url'));
        } catch (e) {
            return false;
        }
    }

    /** JMX 保真导入或已无场景监控 UI 时，不强制根级场景字段 */
    function shouldRequireLegacySceneFields(modelOrData) {
        if (modelOrData && modelOrData._jmx_import_fidelity) return false;
        return isSceneMonitorUiPresent();
    }

    /**
     * 可视化校验用：仅当场景监控 UI 仍存在时强制 base_url/env/influx；
     * 否则仅在字段“已填写”时做格式软校验。
     */
    function validateVisualSceneFieldsOptional(model, helpers) {
        if (!model) return;
        helpers = helpers || {};
        var parseBaseUrl = helpers.parseBaseUrl;
        if (shouldRequireLegacySceneFields(model)) {
            if (typeof parseBaseUrl !== 'function') throw new Error('场景与监控：请填写 base_url');
            parseBaseUrl(model.base_url);
            if (!model.env || !String(model.env).trim()) throw new Error('场景与监控：请填写 env');
            var infReq = model.influxdb || {};
            if (infReq.enabled !== false) {
                if (!infReq.url || !String(infReq.url).trim()) throw new Error('场景与监控：请填写 Influx URL');
                if (!infReq.application || !String(infReq.application).trim()) {
                    throw new Error('场景与监控：请填写 Influx application');
                }
            }
            return;
        }
        var bu = model.base_url == null ? '' : String(model.base_url).trim();
        if (bu && typeof parseBaseUrl === 'function') {
            try { parseBaseUrl(bu); } catch (e) {
                var msg = (e && e.message) ? String(e.message) : String(e);
                if (msg.indexOf('场景与监控') === 0) throw e;
                throw new Error('场景与监控：base_url 格式无效');
            }
        }
    }

    /** 导出/YAML 校验：允许空 base_url，返回可用的协议主机占位 */
    function parseBaseUrlOptional(baseUrl) {
        var u = String(baseUrl || '').trim();
        if (!u) {
            return { protocol: '', host: '', port: '', origin: '', empty: true };
        }
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        var url = new URL(u);
        var protocol = url.protocol.replace(':', '');
        var host = url.hostname;
        var port = url.port || (protocol === 'https' ? '443' : '80');
        return { protocol: protocol, host: host, port: port, origin: url.origin, empty: false };
    }

    function prepareScenarioDataSkipLegacyScene(data) {
        if (!data || typeof data !== 'object') return data;
        if (data._jmx_import_fidelity) {
            data.base_url = data.base_url || '';
            data.influxdb = (data.influxdb && typeof data.influxdb === 'object') ? data.influxdb : {};
            if (data.influxdb.enabled === undefined) data.influxdb.enabled = false;
            return data;
        }
        if (!shouldRequireLegacySceneFields(data)) {
            if (!data.base_url) data.base_url = '';
            data.influxdb = (data.influxdb && typeof data.influxdb === 'object') ? data.influxdb : {};
            var hasInf = !!(data.influxdb.url || data.influxdb.application);
            if (!hasInf && data.influxdb.enabled !== true) {
                data.influxdb.enabled = false;
            }
        }
        return data;
    }

    global.JmsSceneMonitorValidateOptionalV1 = {
        isSceneMonitorUiPresent: isSceneMonitorUiPresent,
        shouldRequireLegacySceneFields: shouldRequireLegacySceneFields,
        validateVisualSceneFieldsOptional: validateVisualSceneFieldsOptional,
        parseBaseUrlOptional: parseBaseUrlOptional,
        prepareScenarioDataSkipLegacyScene: prepareScenarioDataSkipLegacyScene
    };
})(typeof window !== 'undefined' ? window : this);
