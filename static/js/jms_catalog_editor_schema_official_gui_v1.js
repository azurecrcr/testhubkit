/**
 * catalog 编辑器 · 官方 GUI 字段对齐（隔离模块 v1）
 *
 * 共性问题：ALIAS_SCHEMAS 是精简手写字段，不等同 JMeter 官方 GUI。
 * 本模块不改原 schema 文件，优先用各组件 Catalog 数据模型生成完整编辑字段。
 *
 * 覆盖：
 * - BackendListener：实现类下拉 + Async Queue size + Parameters 表（对齐官方 BackendListenerGui）
 * - ViewResultsFullVisualizer / StatVisualizer：ResultCollector 常用字段（对齐 Catalog）
 */
(function (global) {
    'use strict';

    function cloneFields(list) {
        return (list || []).map(function (f) {
            var o = {};
            Object.keys(f).forEach(function (k) { o[k] = f[k]; });
            if (Array.isArray(f.options)) {
                o.options = f.options.map(function (x) {
                    return { val: x.val, label: x.label };
                });
            }
            return o;
        });
    }

    function trimStr(v) {
        return v == null ? '' : String(v).trim();
    }

    function backendClassOptions() {
        var C = global.JmsBackendListenerCatalog;
        if (C && Array.isArray(C.IMPLEMENTATIONS) && C.IMPLEMENTATIONS.length) {
            return C.IMPLEMENTATIONS.map(function (it) {
                return { val: it.value, label: it.label || it.value };
            });
        }
        return [
            {
                val: 'org.apache.jmeter.visualizers.backend.graphite.GraphiteBackendListenerClient',
                label: 'org.apache.jmeter.visualizers.backend.graphite.GraphiteBackendListenerClient'
            },
            {
                val: 'org.apache.jmeter.visualizers.backend.influxdb.InfluxDBRawBackendListenerClient',
                label: 'org.apache.jmeter.visualizers.backend.influxdb.InfluxDBRawBackendListenerClient'
            },
            {
                val: 'org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient',
                label: 'org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient'
            }
        ];
    }

    /** 已停用：influxdbDatabase 非 InfluxdbBackendListenerClient 官方参数（官方 9 项）。
     * 保真改由 jms_backend_listener_params_fidelity_v1 的 mergeParamsForClassnameFidelity 负责。
     */
    var INFLUX_EDITOR_EXTRA_PARAMS = [];

    function ensureOfficialInfluxExtras(classname, params) {
        // 不再注入幽灵参数；若源参数已含自定义键由 merge 逻辑原样保留
        return params || [];
    }

    function rowsForKv(params) {
        return (params || []).map(function (p) {
            var k = p && (p.key || p.name) ? String(p.key || p.name) : '';
            return { key: k, name: k, value: p && p.value != null ? String(p.value) : '' };
        }).filter(function (r) { return !!r.key; });
    }

    function kvToParamRows(rows) {
        var out = [];
        (rows || []).forEach(function (r) {
            if (!r) return;
            var k = trimStr(r.key || r.name);
            if (!k) return;
            out.push({ key: k, value: r.value == null ? '' : String(r.value) });
        });
        return out;
    }

    function mergeParamsForClassname(classname, params) {
        var C = global.JmsBackendListenerCatalog;
        var defaults = C && typeof C.defaultParamsForClassname === 'function'
            ? C.defaultParamsForClassname(classname)
            : [];
        defaults = ensureOfficialInfluxExtras(classname, defaults);
        var map = {};
        (params || []).forEach(function (p) {
            if (!p) return;
            var k = trimStr(p.key || p.name);
            if (k) map[k] = p.value == null ? '' : String(p.value);
        });
        var out = defaults.map(function (d) {
            return {
                key: d.key,
                value: Object.prototype.hasOwnProperty.call(map, d.key) ? map[d.key] : d.value
            };
        });
        Object.keys(map).forEach(function (k) {
            if (!defaults.some(function (d) { return d.key === k; })) {
                out.push({ key: k, value: map[k] });
            }
        });
        return out;
    }

    function schemaBackendListener() {
        return {
            fields: cloneFields([
                {
                    key: 'classname',
                    type: 'select',
                    label: 'Backend Listener implementation',
                    default: (backendClassOptions()[2] && backendClassOptions()[2].val) || '',
                    options: backendClassOptions()
                },
                {
                    key: 'queue_size',
                    type: 'text',
                    label: 'Async Queue size',
                    default: '5000'
                },
                {
                    key: 'parameters',
                    type: 'kv',
                    label: 'Parameters',
                    default: []
                }
            ])
        };
    }

    function schemaResultCollector(kind) {
        var title = kind === 'aggregate' ? '聚合报告' : '查看结果树';
        return {
            fields: cloneFields([
                { key: 'filename', type: 'text', label: 'Filename', default: '' },
                { key: 'log_errors_only', type: 'checkbox', label: 'Errors', default: false },
                { key: 'log_success_only', type: 'checkbox', label: 'Successes', default: false }
            ]),
            _official_label: title
        };
    }

    function resolveOfficialOverride(step) {
        if (!step) return null;
        var alias = step.alias || step.testclass || '';
        if (alias === 'BackendListener') return schemaBackendListener();
        if (alias === 'ViewResultsFullVisualizer') return schemaResultCollector('view');
        if (alias === 'StatVisualizer') return schemaResultCollector('aggregate');
        return null;
    }

    function propsBackendListener(step, rawProps) {
        var C = global.JmsBackendListenerCatalog;
        var src = rawProps && typeof rawProps === 'object' ? rawProps : {};
        var paramRows = Array.isArray(src.parameters) ? src.parameters.slice() : [];
        if (!paramRows.length) {
            Object.keys(src).forEach(function (k) {
                if (k === 'classname' || k === 'queue_size' || k === 'queueSize' ||
                    k === 'comments' || k === 'name' || k === 'enabled' || k === 'parameters') return;
                if (src[k] == null || typeof src[k] === 'object') return;
                paramRows.push({ key: k, value: String(src[k]) });
            });
        }
        var cfg = C && typeof C.normalizeConfig === 'function'
            ? C.normalizeConfig({
                name: step && step.name,
                comments: src.comments || '',
                classname: src.classname,
                queue_size: src.queue_size != null ? src.queue_size : src.queueSize,
                parameters: paramRows,
                enabled: step && step.enabled !== false
            })
            : {
                comments: src.comments || '',
                classname: src.classname || '',
                queue_size: src.queue_size || '5000',
                parameters: paramRows
            };
        cfg.parameters = mergeParamsForClassname(cfg.classname, cfg.parameters);
        return {
            comments: cfg.comments || '',
            classname: cfg.classname,
            queue_size: cfg.queue_size || '5000',
            parameters: rowsForKv(cfg.parameters)
        };
    }

    function persistBackendListener(step, props) {
        var C = global.JmsBackendListenerCatalog;
        var rows = kvToParamRows(props && props.parameters);
        var classname = props && props.classname ? String(props.classname) : '';
        rows = mergeParamsForClassname(classname, rows);
        if (C && typeof C.normalizeConfig === 'function') {
            var cfg = C.normalizeConfig({
                name: step && step.name,
                comments: (props && props.comments) || '',
                classname: classname,
                queue_size: (props && props.queue_size) || '5000',
                parameters: rows,
                enabled: step && step.enabled !== false
            });
            return {
                comments: cfg.comments || '',
                classname: cfg.classname,
                queue_size: cfg.queue_size,
                parameters: cfg.parameters
            };
        }
        return {
            comments: (props && props.comments) || '',
            classname: classname,
            queue_size: (props && props.queue_size) || '5000',
            parameters: rows
        };
    }

    function propsResultCollector(step, rawProps, catalogApi) {
        var src = rawProps && typeof rawProps === 'object' ? rawProps : {};
        var cfg = catalogApi && typeof catalogApi.normalizeConfig === 'function'
            ? catalogApi.normalizeConfig(src)
            : src;
        return {
            comments: cfg.comments != null ? String(cfg.comments) : (src.comments || ''),
            filename: cfg.filename != null ? String(cfg.filename) : (src.filename || ''),
            log_errors_only: !!cfg.log_errors_only,
            log_success_only: !!cfg.log_success_only
        };
    }

    function persistResultCollector(step, props, catalogApi) {
        var cfg = catalogApi && typeof catalogApi.normalizeConfig === 'function'
            ? catalogApi.normalizeConfig(Object.assign({}, props || {}, {
                name: step && step.name,
                enabled: step && step.enabled !== false
            }))
            : (props || {});
        var out = {
            comments: cfg.comments || '',
            filename: cfg.filename || '',
            log_errors_only: !!cfg.log_errors_only,
            log_success_only: !!cfg.log_success_only
        };
        if (cfg.save_config) out.save_config = cfg.save_config;
        return out;
    }

    function patchEditorSchema() {
        var S = global.JmsCatalogElementEditorSchema;
        if (!S || S._officialGuiPatchV1) return false;
        S._officialGuiPatchV1 = true;

        var origGetSchema = S.getSchema;
        S.getSchema = function (step) {
            var ov = resolveOfficialOverride(step);
            if (ov) return { fields: ov.fields };
            return origGetSchema.call(S, step);
        };

        var origProps = S.propsForEditor;
        S.propsForEditor = function (step) {
            var raw = origProps.call(S, step);
            if (!step) return raw;
            if (step.alias === 'BackendListener') return propsBackendListener(step, raw);
            if (step.alias === 'ViewResultsFullVisualizer') {
                return propsResultCollector(step, raw, global.JmsTgViewResultsTreeCatalog);
            }
            if (step.alias === 'StatVisualizer') {
                return propsResultCollector(step, raw, global.JmsTgAggregateReportCatalog);
            }
            return raw;
        };

        var origPersist = S.persistEditorProps;
        S.persistEditorProps = function (step, props) {
            if (step && step.alias === 'BackendListener') {
                return persistBackendListener(step, props);
            }
            if (step && step.alias === 'ViewResultsFullVisualizer') {
                return persistResultCollector(step, props, global.JmsTgViewResultsTreeCatalog);
            }
            if (step && step.alias === 'StatVisualizer') {
                return persistResultCollector(step, props, global.JmsTgAggregateReportCatalog);
            }
            return origPersist.call(S, step, props);
        };

        return true;
    }

    /** classname 切换时按官方实现类刷新 Parameters（保留同名键已有值） */
    function bindClassnameParamRefresh() {
        if (global.document.documentElement.dataset.jmsOfficialBlClassnameBound) return;
        global.document.documentElement.dataset.jmsOfficialBlClassnameBound = '1';
        global.document.addEventListener('change', function (ev) {
            var sel = ev.target && ev.target.closest
                ? ev.target.closest('select[data-dyn-input="1"][data-key="classname"]')
                : null;
            if (!sel) return;
            var modal = sel.closest('.jms-catalog-element-editor-modal, #jms-catalog-element-editor-modal, .jms-modal');
            if (!modal || !modal.classList.contains('jms-modal-open')) return;
            var title = modal.querySelector('.jms-modal-title, [data-catalog-editor-title], h3');
            var hint = (title && title.textContent) || '';
            if (hint.indexOf('BackendListener') < 0 && hint.indexOf('后端监听器') < 0) {
                var dyn = modal.querySelector('[data-catalog-editor-dynamic]');
                if (!dyn || !dyn.querySelector('.jms-catalog-kv-list[data-key="parameters"]')) return;
            }
            var list = modal.querySelector('.jms-catalog-kv-list[data-key="parameters"]');
            if (!list) return;
            var existing = [];
            list.querySelectorAll('.jms-catalog-kv-row').forEach(function (row) {
                var kEl = row.querySelector('[data-kv-key]');
                var vEl = row.querySelector('[data-kv-val]');
                var k = kEl && trimStr(kEl.value);
                if (!k) return;
                existing.push({ key: k, value: vEl ? vEl.value : '' });
            });
            var merged = mergeParamsForClassname(sel.value, existing);
            list.innerHTML = merged.map(function (p, idx) {
                return '<div class="jms-catalog-kv-row" data-kv-index="' + idx + '">' +
                    '<input type="text" data-kv-key placeholder="Name" value="' + escAttr(p.key) + '" />' +
                    '<input type="text" data-kv-val placeholder="Value" value="' + escAttr(p.value) + '" />' +
                    '<button type="button" class="jms-btn-ghost jms-catalog-kv-del" title="删除">×</button></div>';
            }).join('');
        }, true);
    }

    function escAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    var bootAttempts = 0;

    function tryBoot() {
        bootAttempts += 1;
        var ready = !!(global.JmsCatalogElementEditorSchema &&
            typeof global.JmsCatalogElementEditorSchema.getSchema === 'function');
        if (!ready) return false;
        patchEditorSchema();
        bindClassnameParamRefresh();
        return true;
    }

    function boot() {
        if (tryBoot()) return;
        function retry() {
            if (tryBoot() || bootAttempts > 400) return;
            setTimeout(retry, 16);
        }
        if (global.document && global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', retry);
        }
        if (typeof global.addEventListener === 'function') {
            global.addEventListener('load', retry);
        }
        setTimeout(retry, 0);
    }

    global.JmsCatalogEditorSchemaOfficialGuiV1 = {
        resolveOfficialOverride: resolveOfficialOverride,
        propsBackendListener: propsBackendListener,
        persistBackendListener: persistBackendListener,
        mergeParamsForClassname: mergeParamsForClassname,
        patch: boot,
        VERSION: '20260714official-gui1'
    };

    boot();
}(typeof window !== 'undefined' ? window : this));
