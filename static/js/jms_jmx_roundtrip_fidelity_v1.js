/**
 * JMX 导入→导出往返保真 V1（隔离模块）
 * 修：ResultCollector guiclass、计划级多余 Arguments、断言双通道、
 *     BackendListener 幽灵 queueSize、ThreadGroup 属性类型保真。
 * 不改动既有函数语义：通过新方法包装导出/导入关键点。
 */
(function (global) {
    'use strict';

    var ASSERT_ALIASES = {
        ResponseAssertion: 1,
        JSONPathAssertion: 1,
        SizeAssertion: 1,
        MD5HexAssertion: 1,
        JSR223Assertion: 1
    };

    function hasFidelity(data) {
        return !!(data && data._jmx_import_fidelity) || !!global.__jmxImportFidelityActive;
    }

    function hashHasAssertion(step) {
        return (step && step.catalog_hash_children || []).some(function (c) {
            return c && ASSERT_ALIASES[c.alias || c.testclass];
        });
    }

    /** 新方法：hash 已有断言时，禁止 flat 再写一份（含 assert_status 合成） */
    function stripFlatAssertionsWhenHashOwnsThem(step, flat) {
        if (!step || !flat || typeof flat !== 'object') return flat;
        if (!hashHasAssertion(step)) return flat;
        delete flat.assertions;
        delete flat.assert_status;
        return flat;
    }

    /** 新方法：ResultCollector 按 guiclass 分发，避免一律写成 StatVisualizer */
    function resolveResultCollectorAlias(step) {
        if (!step) return '';
        var alias = step.alias || '';
        if (alias === 'ViewResultsFullVisualizer' || alias === 'StatVisualizer') return alias;
        if (alias === 'ResultCollector' || step.testclass === 'ResultCollector') {
            var gui = step.guiclass || '';
            if (gui === 'ViewResultsFullVisualizer') return 'ViewResultsFullVisualizer';
            if (gui === 'StatVisualizer') return 'StatVisualizer';
        }
        return alias;
    }

    function genResultCollectorFidelity(step, indent, helpers) {
        // 保真优先：导入时保存的原片
        if (step && step.jmx_fragment && global.JmxCatalogElement &&
            typeof global.JmxCatalogElement.legacyFallbackXml === 'function') {
            return global.JmxCatalogElement.legacyFallbackXml(step, indent, helpers || {});
        }
        var alias = resolveResultCollectorAlias(step);
        var Aux = global.JmsCatalogAuxJmx;
        if (!Aux || !Aux.MAP) return '';
        var fn = Aux.MAP[alias];
        if (typeof fn === 'function' && alias !== 'ResultCollector') {
            return fn(step, indent, helpers || {});
        }
        return '';
    }

    function wrapWithFragmentPreference(origFn) {
        return function (step, indent, helpers) {
            if (step && step.jmx_fragment && global.JmxCatalogElement &&
                typeof global.JmxCatalogElement.legacyFallbackXml === 'function') {
                return global.JmxCatalogElement.legacyFallbackXml(step, indent, helpers || {});
            }
            return origFn(step, indent, helpers);
        };
    }

    function patchCatalogAuxResultCollector() {
        var Aux = global.JmsCatalogAuxJmx;
        if (!Aux || !Aux.MAP || Aux.__roundtripRcFidelityV1) return false;
        Aux.__roundtripRcFidelityV1 = true;
        Aux.MAP.ResultCollector = function (step, indent, helpers) {
            return genResultCollectorFidelity(step, indent, helpers);
        };
        if (typeof Aux.MAP.ViewResultsFullVisualizer === 'function') {
            Aux.MAP.ViewResultsFullVisualizer = wrapWithFragmentPreference(Aux.MAP.ViewResultsFullVisualizer);
        }
        if (typeof Aux.MAP.StatVisualizer === 'function') {
            Aux.MAP.StatVisualizer = wrapWithFragmentPreference(Aux.MAP.StatVisualizer);
        }
        var origGen = Aux.genXml;
        if (typeof origGen === 'function') {
            Aux.genXml = function (step, indent, helpers) {
                if (step && (step.alias === 'ResultCollector' || step.testclass === 'ResultCollector' ||
                    step.alias === 'ViewResultsFullVisualizer' || step.alias === 'StatVisualizer')) {
                    var xml = genResultCollectorFidelity(step, indent, helpers);
                    if (xml) return xml;
                }
                return origGen.call(Aux, step, indent, helpers);
            };
        }
        return true;
    }

    function patchHttpFlattenStripAssert() {
        var HP = global.JmsCatalogHttpSamplerPrepareV1;
        if (!HP || HP.__roundtripAssertFidelityV1) return false;
        HP.__roundtripAssertFidelityV1 = true;
        var orig = HP.flattenHttpStepForJmxExport;
        if (typeof orig !== 'function') return false;
        HP.flattenHttpStepForJmxExport = function (step) {
            var flat = orig.call(HP, step);
            return stripFlatAssertionsWhenHashOwnsThem(step, flat);
        };
        return true;
    }

    function patchSynthesizeAssertStatus() {
        var N = global.JmsCatalogJmxPropsNormalizeV1;
        if (!N || N.__roundtripAssertSynthV1) return false;
        N.__roundtripAssertSynthV1 = true;
        var orig = N.normalizeCatalogPropsForExport;
        if (typeof orig !== 'function') return false;
        N.normalizeCatalogPropsForExport = function (step) {
            var out = orig.call(N, step);
            if (out && hashHasAssertion(out) && out.catalog_props) {
                delete out.catalog_props.assertions;
                delete out.catalog_props.assert_status;
            }
            return out;
        };
        return true;
    }

    /** 新方法：过滤 JMX 导入时从 UDV 合成的计划级 Arguments */
    function filterSyntheticPlanArgumentsForFidelity(data) {
        if (!data || !hasFidelity(data)) return data;
        if (data._jmx_had_plan_arguments) return data;
        if (!Array.isArray(data.plan_catalog_items)) return data;
        data.plan_catalog_items = data.plan_catalog_items.filter(function (item) {
            if (!item) return false;
            var isArgs = item.alias === 'Arguments' || item.testclass === 'Arguments';
            if (!isArgs) return true;
            if (item.scope === 'imported') return true;
            if (item.scope === 'plan_catalog') return false;
            var nm = String(item.name || '');
            if (/^计划变量/.test(nm)) return false;
            return true;
        });
        return data;
    }

    function patchPrepareForPlanArgs() {
        var P = global.JmsCatalogJmxPrepare;
        if (!P || P.__roundtripPlanArgsV1) return false;
        P.__roundtripPlanArgsV1 = true;
        var orig = P.prepareScenarioForJmx;
        if (typeof orig !== 'function') return false;
        P.prepareScenarioForJmx = function (data) {
            var out = orig.call(P, data);
            var Cap = global.JmsJmxImportTgLoadCaptureV1;
            var xml = global.__jmxLastImportedXml || '';
            // YAML 回载可能丢掉 _jmx_* 标记；只要本会话刚导入过 JMX 就回填原片
            if (Cap && xml && typeof Cap.walkAttachFromRawXml === 'function') {
                if (!out) out = data;
                if (out && typeof out === 'object') {
                    out._jmx_import_fidelity = true;
                    out = Cap.walkAttachFromRawXml(out, xml);
                }
            }
            var PD3 = global.JmsJmxPlanVariablesDedupeV3;
            if (PD3 && typeof PD3.filterPlanCatalogArguments === 'function') {
                out = PD3.filterPlanCatalogArguments(out);
            }
            if (hasFidelity(out) || (xml && out)) {
                out = filterSyntheticPlanArgumentsForFidelity(out);
            }
            if (out && typeof out === 'object') global.__jmxExportRootData = out;
            return out;
        };
        return true;
    }

    /** resolve/migrate 会在 genJmx 内再次合成计划 Arguments —— 导出前再剥一次 */
    function patchApplyResolvedForExport() {
        var R = global.JmsPlanCatalogResolve;
        if (!R || typeof R.applyResolvedForExport !== 'function' || R.__roundtripPlanArgsResolveV1) {
            return false;
        }
        R.__roundtripPlanArgsResolveV1 = true;
        var orig = R.applyResolvedForExport;
        R.applyResolvedForExport = function (data) {
            var out = orig.call(R, data);
            var Cap = global.JmsJmxImportTgLoadCaptureV1;
            var xml = global.__jmxLastImportedXml || '';
            if (Cap && xml && typeof Cap.walkAttachFromRawXml === 'function') {
                if (out && typeof out === 'object') {
                    out._jmx_import_fidelity = true;
                    out = Cap.walkAttachFromRawXml(out, xml);
                }
            }
            var PD3 = global.JmsJmxPlanVariablesDedupeV3;
            if (PD3 && typeof PD3.filterPlanCatalogArguments === 'function') {
                out = PD3.filterPlanCatalogArguments(out);
            }
            if (hasFidelity(out) || xml) out = filterSyntheticPlanArgumentsForFidelity(out);
            if (out && typeof out === 'object') global.__jmxExportRootData = out;
            return out;
        };
        return true;
    }

    function genLoadPropsXmlFromCapture(load, indent) {
        var capt = load && load._jmx_tg_props_xml;
        if (!capt) return '';
        var lines = String(capt).replace(/^\s*\n/, '').replace(/\n\s*$/, '').split(/\r?\n/);
        var xml = '';
        lines.forEach(function (line) {
            if (!String(line).trim()) return;
            xml += indent + String(line).replace(/^\s+/, '') + '\n';
        });
        return xml;
    }

    /** 新方法：保真写出 ThreadGroup 负载属性（优先使用导入时截获的原片） */
    function genLoadPropsXmlFidelity(load, indent) {
        return genLoadPropsXmlFromCapture(load, indent || '');
    }

    function patchGenLoadProps() {
        var Adv = global.JmxScenarioAdvanced;
        if (!Adv || Adv.__roundtripLoadV1) return false;
        if (typeof Adv.genThreadGroupLikeXml !== 'function') return false;
        Adv.__roundtripLoadV1 = true;
        var origTg = Adv.genThreadGroupLikeXml;
        Adv.genThreadGroupLikeXml = function (plan, bu, defaultHeaders, listenerData, tgLabel, opts) {
            // 闭包内 genLoadPropsXml 不受属性替换影响，这里预写保真负载并临时换掉 load 生成入口
            var Cap = global.JmsJmxImportTgLoadCaptureV1;
            var xmlSrc = global.__jmxLastImportedXml || '';
            if (plan && (!plan.load || !plan.load._jmx_tg_props_xml) && Cap && xmlSrc) {
                var shell = {
                    setup_thread_groups: [],
                    thread_groups: [],
                    post_thread_groups: []
                };
                if (opts && opts.isSetup) shell.setup_thread_groups = [plan];
                else if (opts && opts.isPost) shell.post_thread_groups = [plan];
                else shell.thread_groups = [plan];
                Cap.walkAttachFromRawXml(shell, xmlSrc);
            }
            if (plan && plan.load && plan.load._jmx_tg_props_xml) {
                return genThreadGroupLikeXmlFidelity(plan, bu, defaultHeaders, listenerData, tgLabel, opts, origTg);
            }
            return origTg.call(Adv, plan, bu, defaultHeaders, listenerData, tgLabel, opts);
        };
        return true;
    }

    /** 新方法：用保真负载原片生成 ThreadGroup 外壳（不改动原 genThreadGroupLikeXml 闭包） */
    function genThreadGroupLikeXmlFidelity(plan, bu, defaultHeaders, listenerData, tgLabel, opts, origTg) {
        opts = opts || {};
        var helpers = opts.helpers || {};
        var escapeXml = helpers.escapeXml || function (s) { return String(s == null ? '' : s); };
        var isSetup = !!opts.isSetup;
        var isPost = !!opts.isPost;
        var tgName = escapeXml(tgLabel || plan.name || 'Thread Group');
        var tag = isSetup ? 'SetupThreadGroup' : (isPost ? 'PostThreadGroup' : 'ThreadGroup');
        var gui = isSetup ? 'SetupThreadGroupGui' : (isPost ? 'PostThreadGroupGui' : 'ThreadGroupGui');
        var capt = plan && plan.load && plan.load._jmx_tg_props_xml;
        if (!capt) return origTg.call(global.JmxScenarioAdvanced, plan, bu, defaultHeaders, listenerData, tgLabel, opts);

        var xml = '      <' + tag + ' guiclass="' + gui + '" testclass="' + tag + '" testname="' + tgName + '" enabled="true">\n';
        xml += genLoadPropsXmlFidelity(plan.load, '        ');
        xml += '      </' + tag + '>\n      <hashTree>\n';

        // 其余子树仍走原实现：生成完整块后替换第一段 ThreadGroup…hashTree 开头
        var full = origTg.call(global.JmxScenarioAdvanced, plan, bu, defaultHeaders, listenerData, tgLabel, opts);
        var marker = '</' + tag + '>\n      <hashTree>\n';
        var idx = full.indexOf(marker);
        if (idx < 0) return full;
        return xml + full.slice(idx + marker.length);
    }

    function patchBackendListenerQueueSize() {
        var BL = global.JmsBackendListenerJmx;
        if (!BL || BL.__roundtripQueueV1) return false;
        BL.__roundtripQueueV1 = true;

        var origParse = BL.parseBackendListenerEl;
        if (typeof origParse === 'function') {
            BL.parseBackendListenerEl = function (node) {
                var cfg = origParse.call(BL, node);
                if (!cfg || !node) return cfg;
                function getSp(name) {
                    var list = node.getElementsByTagName('stringProp');
                    for (var i = 0; i < list.length; i++) {
                        if (list[i].getAttribute('name') === name) {
                            return (list[i].textContent || '').trim();
                        }
                    }
                    return '';
                }
                var qs = getSp('queueSize') || getSp('AsyncQueue.size');
                if (!qs) {
                    cfg.queue_size = '';
                    cfg._jmx_queue_size_absent = true;
                } else {
                    cfg.queue_size = qs;
                    cfg._jmx_queue_size_absent = false;
                }
                return cfg;
            };
        }

        var origGen = BL.genBackendListenerXml;
        if (typeof origGen === 'function') {
            BL.genBackendListenerXml = function (cfg, indent, escapeXml) {
                if (!cfg) return '';
                var cloned;
                try {
                    cloned = JSON.parse(JSON.stringify(cfg));
                } catch (e) {
                    cloned = cfg;
                }
                if (cloned && (cloned._jmx_queue_size_absent || cloned.queue_size === '' || cloned.queue_size == null)) {
                    cloned.queue_size = '';
                    var xml = origGen.call(BL, cloned, indent, escapeXml);
                    return String(xml).replace(/\s*<stringProp name="queueSize">[^<]*<\/stringProp>\s*/g, '\n');
                }
                return origGen.call(BL, cfg, indent, escapeXml);
            };
        }
        return true;
    }

    function removePlanArgsPrefix(xml, data) {
        if (!xml) return xml;
        var out = xml;
        out = out.replace(/<Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="计划变量"[^>]*>[\s\S]*?<\/Arguments>\s*<hashTree\/>/g, '');
        if (hasFidelity(data) && !(data && data._jmx_had_plan_arguments)) {
            var planName = data && data.name ? String(data.name) : '';
            if (planName) {
                var esc = planName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                var re = new RegExp(
                    '<Arguments[^>]*testname="计划变量 ' + esc + '"[^>]*>[\\s\\S]*?<\\/Arguments>\\s*<hashTree\\/>',
                    'g'
                );
                out = out.replace(re, '');
            } else {
                out = out.replace(
                    /<Arguments[^>]*testname="计划变量 [^"]*"[^>]*>[\s\S]*?<\/Arguments>\s*<hashTree\/>/g,
                    ''
                );
            }
        }
        // 源 JMX 无 queueSize 时，剔除导出时被默认补上的幽灵字段
        var srcXml = global.__jmxLastImportedXml || '';
        if (srcXml && srcXml.indexOf('name="queueSize"') < 0) {
            out = out.replace(/\s*<stringProp name="queueSize">[^<]*<\/stringProp>/g, '');
        }
        return out;
    }

    function patchCompactFinalize() {
        var C = global.JmsJmxExportCompact;
        var F = global.JmsJmxExportFinalizeV1;
        if (!C || typeof C.compactExportXml !== 'function' || C.__roundtripFinalizeV1) return false;
        C.__roundtripFinalizeV1 = true;
        var orig = C.compactExportXml;
        C.compactExportXml = function (xml) {
            var out = orig.call(C, xml);
            var data = global.__jmxExportRootData || null;
            out = removePlanArgsPrefix(out, data);
            if (F && typeof F.finalizeExportXml === 'function' && !C.__roundtripFinalizeNested) {
                C.__roundtripFinalizeNested = true;
                var saved = C.compactExportXml;
                C.compactExportXml = function (x) { return x; };
                try {
                    out = F.finalizeExportXml(out, data);
                } finally {
                    C.compactExportXml = saved;
                    C.__roundtripFinalizeNested = false;
                }
            }
            return out;
        };
        return true;
    }

    function patchPushPlanCatalogAlias() {
        var F = global.JmsJmxImportFidelityV1;
        if (!F || typeof F.sanitizeScenario !== 'function' || F.__roundtripRcAliasV1) return false;
        F.__roundtripRcAliasV1 = true;
        var orig = F.sanitizeScenario;
        F.sanitizeScenario = function (scenario) {
            var out = orig.call(F, scenario);
            if (!out) return out;
            (out.plan_catalog_items || []).forEach(function (it) {
                if (!it) return;
                if (it.testclass === 'ResultCollector' || it.alias === 'ResultCollector') {
                    if (it.guiclass === 'ViewResultsFullVisualizer') it.alias = 'ViewResultsFullVisualizer';
                    else if (it.guiclass === 'StatVisualizer') it.alias = 'StatVisualizer';
                }
            });
            function walk(steps) {
                (steps || []).forEach(function (s) {
                    if (!s) return;
                    if (s.catalog_props && hashHasAssertion(s)) {
                        delete s.catalog_props.assert_status;
                        delete s.catalog_props.assertions;
                    }
                    delete s.assert_status;
                    if (Array.isArray(s.children)) walk(s.children);
                    if (Array.isArray(s.catalog_hash_children)) walk(s.catalog_hash_children);
                });
            }
            ['setup_thread_groups', 'thread_groups', 'post_thread_groups'].forEach(function (k) {
                (out[k] || []).forEach(function (tg) {
                    if (tg && Array.isArray(tg.steps)) walk(tg.steps);
                });
            });
            return out;
        };
        return true;
    }

    function captureTgPropsXml(node) {
        if (!node || !global.XMLSerializer) return '';
        try {
            var full = new global.XMLSerializer().serializeToString(node);
            var gt = full.indexOf('>');
            var close = full.lastIndexOf('</');
            if (gt < 0 || close < 0 || close <= gt) return '';
            return full.slice(gt + 1, close);
        } catch (e) {
            return '';
        }
    }

    function install() {
        patchCatalogAuxResultCollector();
        patchHttpFlattenStripAssert();
        patchSynthesizeAssertStatus();
        patchPrepareForPlanArgs();
        patchApplyResolvedForExport();
        patchGenLoadProps();
        patchBackendListenerQueueSize();
        patchCompactFinalize();
        patchPushPlanCatalogAlias();
    }

    function boot() {
        install();
        var n = 0;
        var t = setInterval(function () {
            n += 1;
            install();
            if (n > 50) clearInterval(t);
        }, 100);
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    global.JmsJmxRoundtripFidelityV1 = {
        install: install,
        stripFlatAssertionsWhenHashOwnsThem: stripFlatAssertionsWhenHashOwnsThem,
        resolveResultCollectorAlias: resolveResultCollectorAlias,
        genLoadPropsXmlFidelity: genLoadPropsXmlFidelity,
        filterSyntheticPlanArgumentsForFidelity: filterSyntheticPlanArgumentsForFidelity,
        captureTgPropsXml: captureTgPropsXml,
        removePlanArgsPrefix: removePlanArgsPrefix
    };
})(typeof window !== 'undefined' ? window : this);
