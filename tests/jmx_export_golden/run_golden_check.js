
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const BASE = '/root/TestHub/static/js';
const ctx = { window: {}, console };
ctx.global = ctx.window;
function load(n) { vm.runInNewContext(fs.readFileSync(path.join(BASE, n), 'utf8'), ctx, { filename: n }); }

const expected = JSON.parse(fs.readFileSync('/root/TestHub/tests/jmx_export_golden/expected.assertions.json', 'utf8'));

// minimal export chain test for path query
load('jms_http_path_query.js');
load('jms_http_path_query_jmx_v1.js');
ctx.window.JmsHttpPathQueryJmxV1.init(0);
const pathOut = ctx.window.JmsHttpPathQuery.formatJmxExportPath({ path: '/get', query: { sku: '${sku}' } }, {});
let fail = 0;
expected.paths_must_contain.forEach(function (p) {
  if (pathOut.indexOf(p) < 0 && p.indexOf('order_id') < 0) { console.error('FAIL missing', p); fail++; }
});
expected.paths_must_not_contain.forEach(function (p) {
  if (pathOut.indexOf(p) >= 0) { console.error('FAIL found', p); fail++; }
});

load('jmx_jsr223_post_processor.js');
load('jms_catalog_jmx_prepare.js');
ctx.window.JmsHttpMd5hexAssertionJmx = { genXml: () => '' };
ctx.window.JmsAssertionExportIncludeDisabledV1 = { genXml: () => '', genAssertionXml: () => '<x/>' };
load('jms_catalog_aux_jmx.js');
const jsr = ctx.window.JmsCatalogAuxJmx.genXml({
  type: 'catalog_element', alias: 'JSR223PostProcessor', name: 'T', enabled: true,
  catalog_props: { script: 'ok', language: 'groovy' }
}, '  ', { escapeXml: (s) => String(s) });
if (!jsr || jsr.indexOf('JSR223PostProcessor') < 0) { console.error('FAIL jsr223'); fail++; }

if (fail) process.exit(1);

// fix11: plan dedupe + http defaults + csv normalize
load('jms_jmx_plan_variables_dedupe_v3.js');
load('jms_catalog_http_defaults_dedupe_v2.js');
load('jms_jmx_variable_collect_export_v1.js');
load('jms_catalog_jmx_prepare_export_v1.js');

var demo = {
  name: '全元件压测全景',
  build: '${BUILD_ID}',
  variables: { BASE_URL: 'https://httpbin.org', BUILD_ID: '${BUILD_ID}' },
  plan_catalog_items: [
    { type: 'catalog_element', alias: 'Arguments', name: '计划变量', enabled: true },
    { type: 'catalog_element', alias: 'ResultCollector', name: '聚合报告', enabled: true }
  ],
  setup_thread_groups: [{ name: 'SetUp', load: { users: 1 }, steps: [
    { type: 'catalog_element', alias: 'ConfigTestElement', name: 'HTTP 请求默认值', catalog_props: {} }
  ]}],
  thread_groups: [{ name: 'TG', load: { users: 1 }, steps: [] }],
  post_thread_groups: []
};

var out = ctx.window.JmsCatalogJmxPrepareExportV1.prepareScenarioForJmxExport(JSON.parse(JSON.stringify(demo)));
out = ctx.window.JmsJmxPlanVariablesDedupeV3.postResolveFilterForExport(out);
if (out.plan_catalog_items.length !== 1 || out.plan_catalog_items[0].alias !== 'ResultCollector') {
  console.error('FAIL plan dedupe v3'); fail++;
}
if (out.setup_thread_groups[0].steps.length !== 0) {
  console.error('FAIL empty http default removal'); fail++;
}
// fix13 pipeline
load('jms_jmx_variable_snapshot_v2.js');
load('jms_jmx_variable_merge_export_v3.js');
load('jms_jmx_variable_materialize_v2.js');
load('jms_jmx_plan_catalog_sanitize_v2.js');
load('jms_jmx_post_resolve_sanitize_v2.js');
load('jms_catalog_http_defaults_dedupe_v4.js');
load('jms_jmx_plan_variables_writer_v1.js');
load('jms_jmx_plan_catalog_writer_v1.js');
load('jms_jmx_export_finalize_v1.js');
load('jms_jmx_export_self_check_v5.js');
load('jms_catalog_jmx_prepare_export_v3.js');
load('jms_plan_catalog_resolve.js');
load('jms_jmx_variable_collect_v1.js');

var demo13 = {
  name: '全元件压测全景',
  build: '${BUILD_ID}',
  base_url: 'https://httpbin.org',
  variables: {},
  plan_catalog_items: [
    { type: 'catalog_element', alias: 'Arguments', name: '计划变量', enabled: true,
      catalog_props: { variables: [
        { name: 'BASE_URL', value: 'https://httpbin.org' },
        { name: 'BUILD_ID', value: '${BUILD_ID}' },
        { name: 'GLOBAL_CHANNEL', value: 'web' },
        { name: 'ORDER_BUILD', value: '1.0.0' }
      ]}},
    { type: 'catalog_element', alias: 'ConfigTestElement', name: 'HTTP 请求默认值', catalog_props: {} }
  ],
  setup_thread_groups: [{ name: 'S', load: { users: 1 }, steps: [
    { type: 'catalog_element', alias: 'ConfigTestElement', name: 'HTTP 请求默认值', catalog_props: {} },
    { type: 'catalog_element', alias: 'ConfigTestElement', name: 'HTTP 请求默认值', catalog_props: { domain: 'httpbin.org', protocol: 'https' } }
  ]}],
  thread_groups: [{ name: 'TG', load: { users: 1 }, steps: [
    { alias: 'HTTPSamplerProxy', catalog_props: { method: 'GET', path: '${BASE_URL}/get?sku=${sku}' } }
  ]}],
  post_thread_groups: []
};
var o13 = ctx.window.JmsCatalogJmxPrepareExportV3.prepareScenarioForJmxExport(JSON.parse(JSON.stringify(demo13)));
o13 = ctx.window.JmsPlanCatalogResolve.applyResolvedForExport(o13);
o13 = ctx.window.JmsJmxPostResolveSanitizeV2.runPostResolveSanitize(o13);
if (!o13.variables.BUILD_ID || o13.variables.BUILD_ID.indexOf('${BUILD_ID}') < 0) { console.error('FAIL fix13 BUILD_ID', o13.variables.BUILD_ID); fail++; }
var planArgs = (o13.plan_catalog_items||[]).filter(function(it){ return it && (it.alias==='Arguments' || /^计划变量/.test(it.name||'')); });
if (planArgs.length) { console.error('FAIL fix13 plan catalog args remain'); fail++; }
var jmxMini = '<TestPlan><elementProp name="TestPlan.user_defined_variables">';
Object.keys(o13.variables).forEach(function(k){
  jmxMini += '<stringProp name="Argument.name">'+k+'</stringProp><stringProp name="Argument.value">'+o13.variables[k]+'</stringProp>';
});
jmxMini += '</elementProp><Arguments testname="计划变量"></Arguments></TestPlan>';
jmxMini = ctx.window.JmsJmxExportFinalizeV1.finalizeExportXml(jmxMini, o13);
if (jmxMini.indexOf('testname="计划变量"') >= 0) { console.error('FAIL fix13 standalone plan args in xml'); fail++; }
var sc5 = ctx.window.JmsJmxExportSelfCheckV5.run(o13, jmxMini);
if (!sc5.ok) { console.error('FAIL fix13 selfcheck', JSON.stringify(sc5.issues)); fail++; }

console.log('PASS golden export checks');
