/**
 * catalog 编辑器 · 配置类元件 JMeter GUI 字段对齐（隔离模块 v1）
 * 补齐 CSVDataSet 等配置元件在 ALIAS_SCHEMAS 中缺失/错误的官方字段。
 */
(function (global) {
    'use strict';

    function cloneFields(list) {
        return (list || []).map(function (f) {
            var o = {};
            Object.keys(f).forEach(function (k) { o[k] = f[k]; });
            if (Array.isArray(f.options)) o.options = f.options.slice();
            return o;
        });
    }

    var CSV_DATA_SET_GUI = [
        { key: 'filename', type: 'text', label: '文件名 (Filename)', default: '' },
        { key: 'file_encoding', type: 'text', label: '文件编码 (File encoding)', default: 'UTF-8' },
        { key: 'variable_names', type: 'text', label: '变量名称 (Variable Names)', default: '' },
        { key: 'ignore_first_line', type: 'checkbox', label: '忽略首行 (Ignore first line)', default: false },
        { key: 'delimiter', type: 'text', label: '分隔符 (Delimiter)', default: ',' },
        { key: 'quoted_data', type: 'checkbox', label: '是否允许带引号? (Quoted data)', default: false },
        { key: 'recycle', type: 'checkbox', label: '遇到文件结束符再次循环? (Recycle on EOF)', default: true },
        { key: 'stop_thread', type: 'checkbox', label: '遇到文件结束符停止线程? (Stop thread on EOF)', default: false },
        { key: 'share_mode', type: 'select', label: '线程共享模式 (Sharing mode)', default: 'shareMode.all', options: [
            { val: 'shareMode.all', label: '所有线程 (All threads)' },
            { val: 'shareMode.group', label: '当前线程组 (Current thread group)' },
            { val: 'shareMode.thread', label: '当前线程 (Current thread)' }
        ]}
    ];

    var COOKIE_POLICY_OPTS = [
        { val: 'standard', label: 'standard' },
        { val: 'standard-strict', label: 'standard-strict' },
        { val: 'ignoreCookies', label: 'ignoreCookies' },
        { val: 'netscape', label: 'netscape' },
        { val: 'default', label: 'default' },
        { val: 'rfc2109', label: 'rfc2109' },
        { val: 'rfc2965', label: 'rfc2965' },
        { val: 'best-match', label: 'best-match' },
        { val: 'compatibility', label: 'compatibility' }
    ];

    var COOKIE_MANAGER_GUI = [
        { key: 'clear_each_iteration', type: 'checkbox', label: '每次迭代清除 Cookie (Clear each iteration)', default: false },
        { key: 'controlled_by_thread_group', type: 'checkbox', label: 'Use Thread Group configuration to control cookie', default: false },
        { key: 'cookie_policy', type: 'select', label: 'Cookie Policy', default: 'standard', options: COOKIE_POLICY_OPTS },
        { key: 'cookies', type: 'kv', label: 'Cookie (name/value)', default: [] }
    ];

    var CONFIG_GUI_OVERRIDES = {
        CSVDataSet: { fields: cloneFields(CSV_DATA_SET_GUI) },
        CookieManager: { fields: cloneFields(COOKIE_MANAGER_GUI) }
    };

    function trimStr(v) {
        return v == null ? '' : String(v).trim();
    }

    function normalizeShareMode(val) {
        var v = trimStr(val);
        if (v === 'all') return 'shareMode.all';
        if (v === 'group') return 'shareMode.group';
        if (v === 'thread') return 'shareMode.thread';
        return v || 'shareMode.all';
    }

    function denormalizeShareMode(val) {
        var v = trimStr(val);
        if (v === 'shareMode.all') return 'shareMode.all';
        if (v === 'shareMode.group') return 'shareMode.group';
        if (v === 'shareMode.thread') return 'shareMode.thread';
        return v || 'shareMode.all';
    }

    function normalizeCsvProps(props) {
        if (!props || typeof props !== 'object') return props;
        var src = trimStr(props.source_path);
        if (src) {
            props.filename = src;
            props.source_path = src;
        }
        props.share_mode = normalizeShareMode(props.share_mode);
        if (!trimStr(props.file_encoding)) props.file_encoding = 'UTF-8';
        if (props.ignore_first_line == null) props.ignore_first_line = false;
        if (props.quoted_data == null) props.quoted_data = false;
        if (props.recycle == null) props.recycle = true;
        if (props.stop_thread == null) props.stop_thread = false;
        return props;
    }

    function resolveConfigOverride(step) {
        if (!step || !step.alias) return null;
        return CONFIG_GUI_OVERRIDES[step.alias] || null;
    }

    function walkStepsCsvNormalize(steps) {
        (steps || []).forEach(function (step) {
            if (!step || typeof step !== 'object') return;
            if (step.alias === 'CSVDataSet' && step.catalog_props) {
                normalizeCsvProps(step.catalog_props);
            }
            if (Array.isArray(step.catalog_hash_children)) walkStepsCsvNormalize(step.catalog_hash_children);
            if (Array.isArray(step.children)) walkStepsCsvNormalize(step.children);
        });
    }

    function normalizeCsvInModel(model) {
        if (!model || typeof model !== 'object') return;
        var groups = (model.setup_thread_groups || [])
            .concat(model.thread_groups || [])
            .concat(model.post_thread_groups || []);
        groups.forEach(function (tg) {
            if (!tg) return;
            if (tg.http_managers && tg.http_managers.csv_data_set) {
                normalizeCsvProps(tg.http_managers.csv_data_set);
            }
            walkStepsCsvNormalize(tg.steps);
        });
        walkStepsCsvNormalize(model.plan_catalog_items);
    }

    function patchEditorSchema() {
        var S = global.JmsCatalogElementEditorSchema;
        if (!S || S._configGuiPatchV1) return;
        S._configGuiPatchV1 = true;

        var origGetSchema = S.getSchema;
        S.getSchema = function (step) {
            if (!step) return { fields: [] };
            var ov = resolveConfigOverride(step);
            if (ov) return ov;
            return origGetSchema.call(S, step);
        };

        var origProps = S.propsForEditor;
        S.propsForEditor = function (step) {
            var props = origProps.call(S, step);
            if (step && step.alias === 'CSVDataSet') {
                props = normalizeCsvProps(props);
            }
            return props;
        };

        var origPersist = S.persistEditorProps;
        S.persistEditorProps = function (step, props) {
            var out = origPersist.call(S, step, props);
            if (step && step.alias === 'CSVDataSet' && out) {
                out = normalizeCsvProps(out);
                out.share_mode = denormalizeShareMode(out.share_mode);
                if (trimStr(out.filename)) out.source_path = trimStr(out.filename);
            }
            return out;
        };
    }

    function patchModelLoad() {
        var U = global.JmsCatalogUnifyMigrate;
        if (!U || U.__configGuiCsvLoadPatch || typeof U.migrateModel !== 'function') return;
        U.__configGuiCsvLoadPatch = true;
        var orig = U.migrateModel;
        U.migrateModel = function (model) {
            var out = orig.call(U, model);
            normalizeCsvInModel(out);
            return out;
        };
    }

    var bootScheduled = false;
    var bootAttempts = 0;

    function tryBoot() {
        bootAttempts += 1;
        var schemaReady = !!(global.JmsCatalogElementEditorSchema && typeof global.JmsCatalogElementEditorSchema.getSchema === 'function');
        if (!schemaReady) return false;
        patchEditorSchema();
        patchModelLoad();
        return true;
    }

    function boot() {
        if (tryBoot()) return;
        if (bootScheduled) return;
        bootScheduled = true;
        function retry() {
            if (tryBoot() || bootAttempts > 300) return;
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

    global.JmsCatalogEditorSchemaConfigGuiV1 = {
        CONFIG_GUI_OVERRIDES: CONFIG_GUI_OVERRIDES,
        normalizeCsvProps: normalizeCsvProps,
        normalizeCsvInModel: normalizeCsvInModel,
        normalizeShareMode: normalizeShareMode,
        patch: boot
    };

    boot();
}(typeof window !== 'undefined' ? window : this));
