/**
 * 线程组 ResultCollector 弹窗 · 配置/自动路径 共享动作（隔离模块）
 * 供查看结果树、聚合报告 TG 监听器弹窗复用，不影响 HTTP 步骤监听器。
 */
(function (global) {
    'use strict';

    var DEFAULT_SAVE_CONFIG = {
        time: true,
        latency: true,
        timestamp: true,
        success: true,
        label: true,
        code: true,
        message: true,
        threadName: true,
        dataType: true,
        encoding: false,
        assertions: true,
        subresults: true,
        responseData: false,
        samplerData: false,
        xml: false,
        fieldNames: true,
        responseHeaders: false,
        requestHeaders: false,
        responseDataOnError: false,
        saveAssertionResultsFailureMessage: true,
        bytes: true,
        sentBytes: true,
        url: true,
        threadCounts: true,
        idleTime: true,
        connectTime: true
    };

    var SAVE_CONFIG_FIELDS = [
        { key: 'time', label: '时间' },
        { key: 'latency', label: '延迟' },
        { key: 'timestamp', label: '时间戳' },
        { key: 'success', label: '成功' },
        { key: 'label', label: '标签' },
        { key: 'code', label: '响应码' },
        { key: 'message', label: '响应消息' },
        { key: 'threadName', label: '线程名' },
        { key: 'dataType', label: '数据类型' },
        { key: 'encoding', label: '编码' },
        { key: 'assertions', label: '断言' },
        { key: 'subresults', label: '子结果' },
        { key: 'responseData', label: '响应数据' },
        { key: 'samplerData', label: '采样器数据' },
        { key: 'xml', label: 'XML' },
        { key: 'fieldNames', label: '字段名' },
        { key: 'responseHeaders', label: '响应头' },
        { key: 'requestHeaders', label: '请求头' },
        { key: 'responseDataOnError', label: '错误时保存响应' },
        { key: 'saveAssertionResultsFailureMessage', label: '断言失败消息' },
        { key: 'bytes', label: '字节数' },
        { key: 'sentBytes', label: '发送字节' },
        { key: 'url', label: 'URL' },
        { key: 'threadCounts', label: '线程计数' },
        { key: 'idleTime', label: '空闲时间' },
        { key: 'connectTime', label: '连接时间' }
    ];

    var _exportContext = { scenarioSlug: 'scenario', buildProperty: true };

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function slugifySegment(s) {
        return String(s || 'item').trim().toLowerCase()
            .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'item';
    }

    function setExportContext(ctx) {
        _exportContext = Object.assign({ scenarioSlug: 'scenario', buildProperty: true }, ctx || {});
    }

    function getExportContext() {
        return Object.assign({}, _exportContext);
    }

    function autoFilename(listenerType, ctx) {
        ctx = Object.assign({}, _exportContext, ctx || {});
        var scenario = slugifySegment(ctx.scenarioSlug || 'scenario');
        var tg = slugifySegment(ctx.tgName || ctx.tgId || 'thread-group');
        var runSeg = ctx.buildProperty !== false ? '${__P(build,run)}' : 'latest';
        var base = 'results/' + scenario + '/runs/' + runSeg + '/' + tg;
        if (listenerType === 'view_results_tree') return base + '/view-results-tree.jtl';
        if (listenerType === 'aggregate_report') return base + '/aggregate-report.jtl';
        return base + '/result.jtl';
    }

    function formatFilenameForDisplay(filename) {
        return String(filename || '').replace(/\$\{__P\(build,run\)\}/g, '{build}');
    }

    function applyListenerFilenamesToTg(tg, scenarioSlug) {
        if (!tg || typeof tg !== 'object') return;
        /* 线程组级 ResultCollector 路径由用户在弹窗内本地选择，不再自动生成。 */
    }

    function applyListenerFilenamesToData(data, scenarioSlug) {
        if (!data || typeof data !== 'object') return;
        var slug = slugifySegment(scenarioSlug || (data.influxdb && data.influxdb.tags && data.influxdb.tags.scenario) || data.name || 'scenario');
        setExportContext({ scenarioSlug: slug });

        function walkTgList(list) {
            if (!Array.isArray(list)) return;
            list.forEach(function (tg) { applyListenerFilenamesToTg(tg, slug); });
        }

        walkTgList(data.thread_groups);
        walkTgList(data.setup_thread_groups);
        walkTgList(data.post_thread_groups);

        if (Array.isArray(data.test_plans)) {
            data.test_plans.forEach(function (plan) {
                walkTgList(plan.thread_groups);
            });
        }
        /* 测试计划级 ResultCollector 路径由用户在弹窗内本地选择，不再自动生成。 */
    }

    function defaultSaveConfig() {
        var out = {};
        Object.keys(DEFAULT_SAVE_CONFIG).forEach(function (k) {
            out[k] = DEFAULT_SAVE_CONFIG[k];
        });
        return out;
    }

    function normalizeSaveConfig(raw) {
        var out = defaultSaveConfig();
        if (!raw || typeof raw !== 'object') return out;
        Object.keys(out).forEach(function (k) {
            if (raw[k] !== undefined) out[k] = !!raw[k];
        });
        return out;
    }

    function saveConfigToYaml(cfg) {
        cfg = normalizeSaveConfig(cfg);
        var out = {};
        var changed = false;
        Object.keys(DEFAULT_SAVE_CONFIG).forEach(function (k) {
            if (!!cfg[k] !== !!DEFAULT_SAVE_CONFIG[k]) {
                out[k] = !!cfg[k];
                changed = true;
            }
        });
        return changed ? out : undefined;
    }

    function saveConfigXml(indent, cfg) {
        cfg = normalizeSaveConfig(cfg);
        var p = indent + '  ';
        var xml = indent + '<objProp>\n' +
            p + '<name>saveConfig</name>\n' +
            p + '<value class="SampleSaveConfiguration">\n';
        Object.keys(DEFAULT_SAVE_CONFIG).forEach(function (k) {
            xml += p + '  <' + k + '>' + (cfg[k] ? 'true' : 'false') + '</' + k + '>\n';
        });
        xml += p + '  <assertionsResultsToSave>0</assertionsResultsToSave>\n';
        xml += p + '</value>\n' + indent + '</objProp>\n';
        return xml;
    }

    function parseSaveConfigFromJmxNode(node) {
        if (!node) return null;
        var obj = null;
        node.querySelectorAll('objProp').forEach(function (op) {
            var nameEl = op.querySelector('name');
            if (nameEl && nameEl.textContent === 'saveConfig') obj = op;
        });
        if (!obj) return null;
        var scope = obj.querySelector('value') || obj;
        var raw = {};
        Object.keys(DEFAULT_SAVE_CONFIG).forEach(function (k) {
            var el = scope.querySelector(k);
            if (el) raw[k] = el.textContent === 'true';
        });
        return normalizeSaveConfig(raw);
    }

    function renderConfigurePanelHtml(fieldPrefix, saveCfg) {
        saveCfg = normalizeSaveConfig(saveCfg);
        var cells = SAVE_CONFIG_FIELDS.map(function (f) {
            return '<label class="jms-tg-rc-savecfg__item">' +
                '<input type="checkbox" data-' + fieldPrefix + '-savecfg="' + f.key + '"' +
                (saveCfg[f.key] ? ' checked' : '') + '>' +
                '<span>' + esc(f.label) + '</span></label>';
        }).join('');
        return '<div class="jms-tg-rc-savecfg">' +
            '<div class="jms-tg-rc-savecfg__head">采样保存配置（saveConfig）</div>' +
            '<div class="jms-tg-rc-savecfg__grid">' + cells + '</div>' +
            '<p class="jms-tg-rc-savecfg__hint">与 JMeter ResultCollector「配置」一致；未改动的项使用默认勾选状态。</p>' +
            '</div>';
    }

    function readSaveConfigFromPanel(root, fieldPrefix) {
        if (!root) return defaultSaveConfig();
        var raw = {};
        root.querySelectorAll('[data-' + fieldPrefix + '-savecfg]').forEach(function (el) {
            var key = el.getAttribute('data-' + fieldPrefix + '-savecfg');
            if (key) raw[key] = !!el.checked;
        });
        return normalizeSaveConfig(raw);
    }

    function toggleConfigurePanel(modal, opts, btn) {
        var body = modal.querySelector(opts.bodySelector);
        if (!body) return;
        var panel = body.querySelector('[' + opts.configPanelAttr + ']');
        if (!panel) return;
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        if (btn) {
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.classList.toggle('is-open', open);
        }
    }

    function bindModalActions(modal, opts) {
        if (!modal || !opts || !opts.bindKey) return;
        var body = modal.querySelector(opts.bodySelector);
        if (!body) return;
        var flag = 'data-jms-tg-rc-bound-' + opts.bindKey;
        if (body.getAttribute(flag) === '1') return;
        body.setAttribute(flag, '1');
        body.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[' + opts.actionAttr + ']');
            if (!btn) return;
            ev.preventDefault();
            var action = btn.getAttribute(opts.actionAttr);
            if (action === 'toggle-config') {
                toggleConfigurePanel(modal, opts, btn);
            }
        });
    }

    global.JmsTgResultCollectorActions = {
        DEFAULT_SAVE_CONFIG: DEFAULT_SAVE_CONFIG,
        defaultSaveConfig: defaultSaveConfig,
        normalizeSaveConfig: normalizeSaveConfig,
        saveConfigToYaml: saveConfigToYaml,
        saveConfigXml: saveConfigXml,
        parseSaveConfigFromJmxNode: parseSaveConfigFromJmxNode,
        renderConfigurePanelHtml: renderConfigurePanelHtml,
        readSaveConfigFromPanel: readSaveConfigFromPanel,
        bindModalActions: bindModalActions,
        slugifySegment: slugifySegment,
        setExportContext: setExportContext,
        getExportContext: getExportContext,
        autoFilename: autoFilename,
        formatFilenameForDisplay: formatFilenameForDisplay,
        applyListenerFilenamesToData: applyListenerFilenamesToData
    };
}(typeof window !== 'undefined' ? window : this));
