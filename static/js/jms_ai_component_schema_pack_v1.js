/**
 * AI 两轮 · 按清单从编辑字段说明书自动抽取格式包（只读，零手写示例库）
 */
(function (global) {
    'use strict';

    var MAX_TARGETS = 8;

    var ALIAS_NORMALIZE = {
        HTTPRequest: 'HTTPSamplerProxy',
        HttpSampler: 'HTTPSamplerProxy',
        http: 'HTTPSamplerProxy',
        Header: 'HeaderManager',
        Headers: 'HeaderManager',
        HttpDefaults: 'ConfigTestElement',
        AggregateReport: 'StatVisualizer',
        ViewResultsTree: 'ResultCollector',
        JSONAssertion: 'JSONPathAssertion',
        JsonAssertion: 'JSONPathAssertion'
    };

    /** 大类铁律：少量固定提示，非逐组件示例 */
    var CATEGORY_HINTS = {
        sampler: '发请求时：method/path 必填。若用户点名公网站点（如百度/谷歌等）或完整 URL，path 必须写绝对地址 http(s)://域名/路径（如 https://www.baidu.com/s），禁止只写 /s；查询参数用 query 对象，勿把 ?a=1 塞进 path；JSON 体用 body 字符串。相对路径 /api/... 仅适用于已有 HTTP 默认值/BASE_URL 的站内接口。',
        assertion: '断言请按格式包字段填写；状态码类优先用明确数值。',
        config: '线程组配置请用 tg 模型：HTTP 请求默认值 component 必须为 {\"type\":\"http_defaults\",\"name\":\"...\",\"data\":{\"protocol\":\"https\",\"domain\":\"www.baidu.com\",\"port\":\"443\"}}；禁止只给 ConfigTestElement/alias 而无 type=http_defaults。',
        controller: '逻辑控制器需 name；If 需 condition。',
        postprocessor: '提取器需填写引用名与表达式相关字段。',
        listener: '监听器一般只需 name/enabled；BackendListener 需 classname 与 parameters。'
    };

    function normalizeAlias(alias) {
        var a = String(alias || '').trim();
        if (!a) return '';
        if (ALIAS_NORMALIZE[a]) return ALIAS_NORMALIZE[a];
        return a;
    }

    function getSchemaApi() {
        return global.JmsCatalogElementEditorSchema || null;
    }

    function fieldsFromSchema(schema) {
        var out = [];
        (schema && schema.fields ? schema.fields : []).forEach(function (f) {
            if (!f || !f.key) return;
            var row = {
                key: f.key,
                type: f.type || 'text',
                label: f.label || f.key
            };
            if (f.default !== undefined) row.default = f.default;
            if (f.min != null) row.min = f.min;
            if (Array.isArray(f.options)) {
                row.options = f.options.map(function (opt) {
                    if (opt && typeof opt === 'object') {
                        return { val: opt.val != null ? opt.val : opt.value, label: opt.label || String(opt.val != null ? opt.val : opt.value) };
                    }
                    return { val: opt, label: String(opt) };
                });
            }
            out.push(row);
        });
        return out;
    }

    function packOne(target) {
        var t = target && typeof target === 'object' ? target : {};
        var alias = normalizeAlias(t.alias || t.type || '');
        var category = String(t.category || '').trim().toLowerCase();
        var Schema = getSchemaApi();
        var stepHint = {
            alias: alias,
            category: category || undefined,
            guiclass: t.guiclass || (alias === 'ConfigTestElement' ? 'HttpDefaultsGui' : undefined)
        };
        var schema = Schema && typeof Schema.getSchema === 'function' ? Schema.getSchema(stepHint) : { fields: [] };
        var fields = fieldsFromSchema(schema);
        if (!fields.length && Schema && Schema.ALIAS_SCHEMAS && Schema.ALIAS_SCHEMAS[alias]) {
            fields = fieldsFromSchema(Schema.ALIAS_SCHEMAS[alias]);
        }
        var defaults = null;
        if (Schema && typeof Schema.defaultProps === 'function') {
            try { defaults = Schema.defaultProps(stepHint); } catch (e1) { defaults = null; }
        }
        var hint = CATEGORY_HINTS[category] || '';
        if (alias === 'HTTPSamplerProxy') {
            hint = (hint ? hint + ' ' : '') +
                'HTTPSamplerProxy 示例：站内 {"name":"登录","method":"POST","path":"/api/login","body":"{}" }；公网站点 {"name":"百度查询","method":"GET","path":"https://www.baidu.com/s","query":{"wd":"关键词"}}。禁止公网站点 path 只写 /s。';
        }
        if (alias === 'ConfigTestElement' || category === 'config') {
            hint = (hint ? hint + ' ' : '') +
                '监听器挂在接口下时务必带 parent_ref_id=取样器ref；监听器（kind=listener）务必带 listener_key：view_results_tree / aggregate_report / backend_listener（也可由名称推断）；HTTP 请求默认值（kind=config）务必用：{"type":"http_defaults","name":"百度默认值","data":{"protocol":"https","domain":"www.baidu.com","port":"443","enabled":true}}；不要用 alias=ConfigTestElement 代替 type。';
        }
        return {
            alias: alias,
            action: String(t.action || 'add').toLowerCase(),
            kind: String(t.kind || 'step').toLowerCase(),
            category: category,
            note: String(t.note || ''),
            fields: fields,
            defaults: defaults,
            hint: hint,
            has_schema: fields.length > 0
        };
    }

    function buildSchemaPack(targets) {
        var list = Array.isArray(targets) ? targets.slice(0, MAX_TARGETS) : [];
        var seen = {};
        var pack = [];
        list.forEach(function (t) {
            var one = packOne(t);
            if (!one.alias) return;
            var key = one.alias + '|' + (one.guiclass || '');
            if (seen[one.alias]) {
                // 同 alias 合并 note
                if (one.note) seen[one.alias].note = (seen[one.alias].note ? seen[one.alias].note + '；' : '') + one.note;
                return;
            }
            seen[one.alias] = one;
            pack.push(one);
        });
        return pack;
    }

    function buildBriefTimeline(full) {
        full = full || {};
        return {
            timeline: (full.timeline || []).map(function (item, idx) {
                return {
                    index: item.index != null ? item.index : (idx + 1),
                    ref_id: item.ref_id,
                    kind: item.kind,
                    subtype: item.subtype,
                    name: item.name,
                    summary: item.summary
                };
            }),
            step_tree: (full.step_tree || []).map(function (item) {
                return {
                    ref_id: item.ref_id,
                    parent_ref_id: item.parent_ref_id || null,
                    depth: item.depth,
                    kind: item.kind,
                    subtype: item.subtype,
                    name: item.name,
                    summary: item.summary
                };
            })
        };
    }

    global.JmsAiComponentSchemaPackV1 = {
        MAX_TARGETS: MAX_TARGETS,
        normalizeAlias: normalizeAlias,
        packOne: packOne,
        buildSchemaPack: buildSchemaPack,
        buildBriefTimeline: buildBriefTimeline
    };
})(typeof window !== 'undefined' ? window : this);
