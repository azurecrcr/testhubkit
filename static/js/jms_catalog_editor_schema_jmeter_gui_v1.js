/**
 * JMeter 官方 GUI 字段 · 编辑器 schema 全量对齐（隔离补丁，不修改原 schema 文件）
 * 根因：ALIAS_SCHEMAS / schema_extend 将 BeanShell 误用 JSR223 风格（script+language），
 *       且 *PostProcessor/*PreProcessor 通配回退为 SCRIPT_FIELDS。
 */
(function (global) {
    'use strict';

    var LANG_OPTS = [
        { val: 'groovy', label: 'groovy' },
        { val: 'javascript', label: 'javascript' },
        { val: 'beanshell', label: 'beanshell' },
        { val: 'jython', label: 'jython' }
    ];

    var EXTRACT_APPLY_OPTS = [
        { val: 'main', label: 'Main sample only' },
        { val: 'sub', label: 'Sub-samples only' },
        { val: 'all', label: 'Main sample and sub-samples' },
        { val: 'variable', label: 'JMeter Variable Name to use' }
    ];

    function cloneFields(list) {
        return (list || []).map(function (f) {
            var o = {};
            Object.keys(f).forEach(function (k) { o[k] = f[k]; });
            if (Array.isArray(f.options)) o.options = f.options.slice();
            return o;
        });
    }

    /** TestBeanGUI · BeanShell 族（无 language） */
    var BEANSHELL_GUI = [
        { key: 'reset_interpreter', type: 'checkbox', label: 'Reset bsh.Interpreter before each call', default: false },
        { key: 'parameters', type: 'text', label: 'Parameters (=> String Parameters and String []bsh.args)', default: '' },
        { key: 'filename', type: 'text', label: 'Script file (overrides script) · File Name', default: '' },
        { key: 'script', type: 'textarea', label: 'Script (variables: ctx vars props prev data log)', default: '' }
    ];

    /** TestBeanGUI · JSR223 族 */
    var JSR223_GUI = [
        { key: 'cache_compiled', type: 'checkbox', label: 'Cache compiled script if available', default: true },
        { key: 'filename', type: 'text', label: 'Script file (overrides script) · File Name', default: '' },
        { key: 'parameters', type: 'text', label: 'Parameters (=> String Parameters and String []args)', default: '' },
        { key: 'script', type: 'textarea', label: 'Script', default: '' },
        { key: 'language', type: 'select', label: 'Script language (scriptLanguage)', default: 'groovy', options: LANG_OPTS }
    ];

    /** BSF 族 */
    var BSF_GUI = [
        { key: 'language', type: 'select', label: 'Script language', default: 'beanshell', options: LANG_OPTS },
        { key: 'parameters', type: 'text', label: 'Parameters', default: '' },
        { key: 'filename', type: 'text', label: 'Script file · File Name', default: '' },
        { key: 'script', type: 'textarea', label: 'Script', default: '' }
    ];

    var JSON_PATH_ASSERTION_GUI = [
        { key: 'json_path', type: 'text', label: 'JSON Path', default: '' },
        { key: 'additionally_assert_value', type: 'checkbox', label: 'Additionally assert value', default: false },
        { key: 'expected', type: 'text', label: 'Expected Value', default: '' },
        { key: 'is_regex', type: 'checkbox', label: 'Additionally assert value is regex', default: false },
        { key: 'expect_null', type: 'checkbox', label: 'Expect null', default: false },
        { key: 'invert', type: 'checkbox', label: 'Invert assertion', default: false }
    ];

    var JMES_PATH_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Name of created variable', default: '' },
        { key: 'jmes_path', type: 'text', label: 'JMES Path expressions', default: '' },
        { key: 'match_numbers', type: 'text', label: 'Match No.', default: '0' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' }
    ];

    var BOUNDARY_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
        { key: 'left_boundary', type: 'text', label: 'Left Boundary', default: '' },
        { key: 'right_boundary', type: 'text', label: 'Right Boundary', default: '' },
        { key: 'match_number', type: 'text', label: 'Match No.', default: '1' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
        { key: 'use_headers', type: 'checkbox', label: 'Use Headers', default: false }
    ];

    var HTML_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
        { key: 'expr', type: 'text', label: 'CSS/JQuery selector', default: '' },
        { key: 'attribute', type: 'text', label: 'Attribute', default: '' },
        { key: 'match_number', type: 'text', label: 'Match No.', default: '0' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
        { key: 'extract_attribute', type: 'checkbox', label: 'Extract attribute', default: false },
        { key: 'use_empty', type: 'checkbox', label: 'Use empty default value', default: false }
    ];

    var XPATH_EXTRACTOR_GUI = [
        { key: 'apply_to', type: 'select', label: 'Apply to', default: 'main', options: EXTRACT_APPLY_OPTS },
        { key: 'apply_to_variable', type: 'text', label: 'Variable', default: '' },
        { key: 'refname', type: 'text', label: 'Reference Name', default: '' },
        { key: 'xpath_query', type: 'text', label: 'XPath Query', default: '' },
        { key: 'match_number', type: 'text', label: 'Match No.', default: '-1' },
        { key: 'default_value', type: 'text', label: 'Default Value', default: '' },
        { key: 'validate_xml', type: 'checkbox', label: 'Validate XML', default: false }
    ];

    var DEBUG_POST_PROCESSOR_GUI = [
        { key: 'notes', type: 'textarea', label: '说明（Debug PostProcessor 在运行时输出取样器属性，无额外配置项）', default: '' }
    ];

    var JMX_FRAGMENT_GUI = [
        { key: 'jmx_fragment', type: 'textarea', label: 'JMX 片段 (高级)', default: '' }
    ];

    var BEANSHELL_ALIASES = [
        'BeanShellPostProcessor', 'BeanShellPreProcessor', 'BeanShellTimer',
        'BeanShellAssertion', 'BeanShellSampler', 'BeanShellListener'
    ];

    var JSR223_ALIASES = [
        'JSR223PostProcessor', 'JSR223PreProcessor', 'JSR223Timer',
        'JSR223Assertion', 'JSR223Sampler', 'JSR223Listener'
    ];

    var BSF_ALIASES = [
        'BSFPostProcessor', 'BSFPreProcessor', 'BSFTimer',
        'BSFAssertion', 'BSFSampler', 'BSFListener'
    ];

    var GUI_OVERRIDES = {};

    function setOverride(alias, fields) {
        GUI_OVERRIDES[alias] = { fields: cloneFields(fields) };
    }

    BEANSHELL_ALIASES.forEach(function (a) { setOverride(a, BEANSHELL_GUI); });
    JSR223_ALIASES.forEach(function (a) { setOverride(a, JSR223_GUI); });
    BSF_ALIASES.forEach(function (a) { setOverride(a, BSF_GUI); });
    setOverride('JSONPathAssertion', JSON_PATH_ASSERTION_GUI);
    setOverride('XPathExtractor', XPATH_EXTRACTOR_GUI);
    setOverride('JMESPathExtractor', JMES_PATH_EXTRACTOR_GUI);
    setOverride('BoundaryExtractor', BOUNDARY_EXTRACTOR_GUI);
    setOverride('HtmlExtractor', HTML_EXTRACTOR_GUI);
    setOverride('DebugPostProcessor', DEBUG_POST_PROCESSOR_GUI);

    function resolveOverride(step) {
        if (!step) return null;
        var alias = step.alias || '';
        if (!alias) return null;
        if (GUI_OVERRIDES[alias]) return GUI_OVERRIDES[alias];
        if (/^BeanShell/.test(alias)) return { fields: cloneFields(BEANSHELL_GUI) };
        if (/^JSR223/.test(alias)) return { fields: cloneFields(JSR223_GUI) };
        if (/^BSF/.test(alias)) return { fields: cloneFields(BSF_GUI) };
        return null;
    }

    function fieldKeys(fields) {
        return (fields || []).map(function (f) { return f && f.key; }).filter(Boolean).join(',');
    }

    function isWrongScriptFallback(alias, fields) {
        if (!alias || !fields || !fields.length) return false;
        if (/^BeanShell|^BSF|^JSR223/.test(alias)) return false;
        var keys = fieldKeys(fields);
        if ((/PostProcessor$/.test(alias) || /PreProcessor$/.test(alias)) &&
            keys.indexOf('script') >= 0 && keys.indexOf('language') >= 0) {
            return true;
        }
        if (/Timer$/.test(alias) && keys.indexOf('script') >= 0 && keys.indexOf('language') >= 0 &&
            alias !== 'JSR223Timer' && alias !== 'BSFTimer' && alias !== 'BeanShellTimer') {
            return true;
        }
        return false;
    }

    function normalizePropsForEditor(step, props) {
        if (!step || !props) return props;
        var alias = step.alias || '';
        if (/^BeanShell/.test(alias)) {
            delete props.language;
            delete props.scriptLanguage;
        }
        if (/^JSR223/.test(alias)) {
            if (!props.language && props.scriptLanguage) props.language = props.scriptLanguage;
            if (props.cache_compiled === undefined) {
                if (props.cache_key === 'false' || props.cache_compiled === false) props.cache_compiled = false;
                else props.cache_compiled = true;
            }
        }
        if (alias === 'JSONPathAssertion') {
            if (props.expected == null && props.expected_value != null) props.expected = props.expected_value;
            if (props.additionally_assert_value == null && props.validate_json != null) {
                props.additionally_assert_value = !!props.validate_json;
            }
        }
        return props;
    }

    function normalizePersistProps(step, props) {
        if (!step || !props) return props;
        var alias = step.alias || '';
        var out = Object.assign({}, props);
        if (/^BeanShell/.test(alias)) {
            delete out.language;
            delete out.scriptLanguage;
        }
        if (/^JSR223/.test(alias)) {
            if (out.language && !out.scriptLanguage) out.scriptLanguage = out.language;
            delete out.cache_key;
        }
        if (alias === 'JSONPathAssertion') {
            delete out.expected_value;
            delete out.validate_json;
        }
        return out;
    }

    function patchEditorSchema() {
        var S = global.JmsCatalogElementEditorSchema;
        if (!S || S._jmeterGuiPatchV1) return;
        S._jmeterGuiPatchV1 = true;

        var origGetSchema = S.getSchema;
        S.getSchema = function (step) {
            if (!step) return { fields: [] };
            if (step.alias === 'ConfigTestElement' && step.guiclass === 'HttpDefaultsGui') {
                return origGetSchema.call(S, step);
            }
            var ov = resolveOverride(step);
            if (ov) return ov;
            var schema = origGetSchema.call(S, step);
            if (isWrongScriptFallback(step.alias, schema && schema.fields)) {
                return { fields: cloneFields(JMX_FRAGMENT_GUI) };
            }
            return schema;
        };

        var origProps = S.propsForEditor;
        S.propsForEditor = function (step) {
            return normalizePropsForEditor(step, origProps.call(S, step));
        };

        var origPersist = S.persistEditorProps;
        S.persistEditorProps = function (step, props) {
            return origPersist.call(S, step, normalizePersistProps(step, props));
        };
    }

    function patchSchemaExtend() {
        var Ext = global.JmsCatalogSchemaExtend;
        if (!Ext || Ext._jmeterGuiPatchV1) return;
        Ext._jmeterGuiPatchV1 = true;

        var origGet = Ext.getSchemaForAlias;
        Ext.getSchemaForAlias = function (step) {
            if (!step) return { fields: [] };
            var ov = resolveOverride(step);
            if (ov) {
                var patched = { fields: ov.fields.slice() };
                patched.fields.unshift({ key: 'comments', type: 'textarea', label: '注释', default: '' });
                var cat = step.category || 'other';
                if (cat === 'other' || cat === 'listener') {
                    patched.fields.push({ key: 'jmx_fragment', type: 'textarea', label: 'JMX 片段 (高级)', default: '' });
                }
                return patched;
            }
            var schema = origGet.call(Ext, step);
            if (isWrongScriptFallback(step.alias, schema && schema.fields)) {
                var fixed = { fields: [{ key: 'comments', type: 'textarea', label: '注释', default: '' }] };
                fixed.fields = fixed.fields.concat(cloneFields(JMX_FRAGMENT_GUI));
                return fixed;
            }
            return schema;
        };
    }

    function boot() {
        patchEditorSchema();
        patchSchemaExtend();
    }

    global.JmsCatalogEditorSchemaJmeterGuiV1 = {
        resolveOverride: resolveOverride,
        GUI_OVERRIDES: GUI_OVERRIDES,
        BEANSHELL_GUI: BEANSHELL_GUI,
        JSR223_GUI: JSR223_GUI,
        patch: boot
    };

    boot();
}(typeof window !== 'undefined' ? window : this));
