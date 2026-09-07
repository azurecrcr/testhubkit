const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

function patchQuerySelector(el) {
    if (!el || el.querySelector) return;
    el.querySelector = function (sel) {
        if (sel === 'parsererror') return null;
        if (sel === 'jmeterTestPlan > hashTree > hashTree') {
            var ht = el.getElementsByTagName('hashTree');
            return ht && ht.length >= 2 ? ht[1] : (ht[0] || null);
        }
        if (sel === 'hashTree') { var h = el.getElementsByTagName('hashTree'); return h[0] || null; }
        if (sel === 'TestPlan') { var t = el.getElementsByTagName('TestPlan'); return t[0] || null; }
        var m = sel.match(/^elementProp\[name="([^"]+)"\]$/);
        if (m) {
            var eps = el.getElementsByTagName('elementProp');
            for (var i = 0; i < eps.length; i++) if (eps[i].getAttribute('name') === m[1]) return eps[i];
        }
        return null;
    };
    el.querySelectorAll = function (sel) {
        if (sel === 'HTTPSamplerProxy') return el.getElementsByTagName('HTTPSamplerProxy');
        return [];
    };
}

const BASE = '/root/TestHub/static/js';
const ctx = { window: {}, console };
ctx.global = ctx.window;
ctx.DOMParser = class {
    parseFromString(s) {
        var doc = new DOMParser().parseFromString(s, 'text/xml');
        patchQuerySelector(doc);
        var all = doc.getElementsByTagName('*');
        for (var i = 0; i < all.length; i++) patchQuerySelector(all[i]);
        return doc;
    }
};
ctx.window.DOMParser = ctx.DOMParser;
function load(n) { vm.runInNewContext(fs.readFileSync(path.join(BASE, n), 'utf8'), ctx, { filename: n }); }

[
    'jms_tg_config_catalog.js', 'jms_jmx_import_header_props_normalize_v1.js',
    'jms_jmx_import_listener_step_v1.js', 'jms_jmx_import_controller_config_step_v1.js',
    'jms_jmx_import_sampler_hash_timeline_v1.js', 'jms_jmx_import_config_attach_v1.js',
    'jms_catalog_legacy_purge.js', 'jms_catalog_unify_migrate.js', 'jms_jmx_import_catalog_bridge.js',
    'jmx_import_parser.js'
].forEach(load);

const xml = fs.readFileSync('/tmp/AIssp.jmx', 'utf8');
const scenario = ctx.window.JmxImportParser.parseJmxXml(xml);
const migrated = ctx.window.JmsJmxImportCatalogBridge.prepareScenario(JSON.parse(JSON.stringify(scenario)));
const tg = (migrated.thread_groups || []).find(function (t) { return t.name === '我的动态'; });

function findIf(steps) {
    for (var i = 0; i < (steps || []).length; i++) {
        var s = steps[i];
        if ((s.name || '').indexOf('学员执行') >= 0) return s;
        var n = findIf(s.children); if (n) return n;
    }
    return null;
}
const ifStep = findIf(tg.steps);
const http = (ifStep.children || []).find(function (c) { return (c.name || '').indexOf('添加动态-没有图片') >= 0; });
const hm = (http && http.catalog_hash_children || []).find(function (c) { return c.alias === 'HeaderManager'; });
console.log('HeaderManager name:', hm && hm.name);
console.log('headers type:', hm && Array.isArray(hm.catalog_props.headers) ? 'array' : typeof (hm && hm.catalog_props.headers));
console.log('headers count:', hm && hm.catalog_props.headers && hm.catalog_props.headers.length);
console.log('headers sample:', JSON.stringify((hm && hm.catalog_props.headers || []).slice(0, 5), null, 0));
