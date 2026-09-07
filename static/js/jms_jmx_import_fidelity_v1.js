/**
 * JMX 导入保真（隔离模块 v6）
 * 修复：JMX 导入后因 http_managers 缺失被当成 enabled 而向每个线程组注入空壳 HTTP 请求默认值；以及 syncYamlFromModel 丢失 fidelity 后重新迁移计划级 HTTP/Influx。
 */
(function (global) {
    'use strict';

    var GUI_HTTP_DEFAULTS = 'HttpDefaultsGui';
    var ALIAS_CONFIG = 'ConfigTestElement';
    var ALIAS_BACKEND = 'BackendListener';
    var SYNTH_HTTP_NAMES = { 'HTTP 请求默认值': true, 'HTTP Request Defaults': true };
    var SYNTH_BACKEND_NAMES = { 'InfluxDB Backend Listener': true };

    function isSyntheticSceneItem(item) {
        if (!item) return false;
        if (item.alias === ALIAS_BACKEND) {
            if (item.scope === 'plan_catalog') return true;
            if (SYNTH_BACKEND_NAMES[item.name]) return true;
            return false;
        }
        if (item.alias === ALIAS_CONFIG && item.guiclass === GUI_HTTP_DEFAULTS) {
            if (item.scope === 'plan_catalog') return true;
            if (SYNTH_HTTP_NAMES[item.name]) return true;
            return false;
        }
        return false;
    }

    function emptyInflux() {
        return {
            enabled: false,
            url: '',
            application: '',
            measurement: 'jmeter',
            tags: {}
        };
    }

    function hasFidelityFlag(obj) {
        return !!(obj && obj._jmx_import_fidelity);
    }

    function sanitizeYamlData(data) {
        if (!data || typeof data !== 'object') return data;
        data._jmx_import_fidelity = true;
        data.base_url = '';
        data.influxdb = emptyInflux();
        if (Array.isArray(data.plan_catalog_items)) {
            data.plan_catalog_items = data.plan_catalog_items.filter(function (it) {
                return !isSyntheticSceneItem(it);
            });
        }
        return data;
    }

    function ensureFidelityInYamlText(yamlText) {
        if (!yamlText || !global.jsyaml) return yamlText;
        try {
            var data = global.jsyaml.load(yamlText);
            if (!hasFidelityFlag(data)) return yamlText;
            sanitizeYamlData(data);
            return global.jsyaml.dump(data, { lineWidth: 120, noRefs: true });
        } catch (e) {
            return yamlText;
        }
    }

    function stampYamlInputFromModel(model) {
        if (!hasFidelityFlag(model)) return;
        var inp = global.document && global.document.getElementById('yaml-input');
        if (!inp || !global.jsyaml) return;
        try {
            var data = global.jsyaml.load(inp.value || '') || {};
            sanitizeYamlData(data);
            inp.value = global.jsyaml.dump(data, { lineWidth: 120, noRefs: true });
        } catch (e) { /* ignore */ }
    }

    function sanitizeScenario(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        scenario._jmx_import_fidelity = true;
        delete scenario.influxdb;
        delete scenario.base_url;
        if (Array.isArray(scenario.plan_catalog_items)) {
            scenario.plan_catalog_items = scenario.plan_catalog_items.filter(function (it) {
                return !isSyntheticSceneItem(it);
            });
        }
        return scenario;
    }


    function hasTextProp(v) {
        return v !== undefined && v !== null && String(v).trim() !== '';
    }

    function isEmptyHttpDefaultsData(d) {
        d = d || {};
        var Catalog = global.JmsTgConfigCatalog;
        if (Catalog && typeof Catalog.hasContent === 'function') {
            return !Catalog.hasContent({ type: 'http_defaults', data: d });
        }
        var argHit = global.JmsTgHttpDefaultsJmx && typeof global.JmsTgHttpDefaultsJmx.hasArgContent === 'function' &&
            global.JmsTgHttpDefaultsJmx.hasArgContent(d);
        var advHit = global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.hasContent === 'function' &&
            global.JmsTgHttpDefaultsAdvanced.hasContent(d);
        return !(hasTextProp(d.name) || hasTextProp(d.comments) || hasTextProp(d.protocol) || hasTextProp(d.domain) ||
            hasTextProp(d.port) || hasTextProp(d.path) || hasTextProp(d.connect_timeout) || hasTextProp(d.response_timeout) ||
            hasTextProp(d.content_encoding) || d.auto_redirects === true || d.follow_redirects === false ||
            d.use_keepalive === false || (hasTextProp(d.implementation) && d.implementation !== 'HttpClient4') ||
            argHit || advHit);
    }

    function shouldStripEmptyTgHttpDefaultsStep(step) {
        if (!step) return false;
        if (!(step.guiclass === GUI_HTTP_DEFAULTS || (step.alias === ALIAS_CONFIG && step.guiclass === GUI_HTTP_DEFAULTS))) {
            return false;
        }
        if (!isEmptyHttpDefaultsData(step.catalog_props || step.data || {})) return false;
        var nm = step.name || step.label_zh || '';
        return !nm || !!SYNTH_HTTP_NAMES[nm];
    }

    function stripEmptyHttpDefaultsFromSteps(list) {
        if (!Array.isArray(list)) return list;
        var out = [];
        list.forEach(function (s) {
            if (!s) return;
            if (shouldStripEmptyTgHttpDefaultsStep(s)) return;
            if (Array.isArray(s.children)) s.children = stripEmptyHttpDefaultsFromSteps(s.children);
            if (Array.isArray(s.catalog_hash_children)) {
                s.catalog_hash_children = stripEmptyHttpDefaultsFromSteps(s.catalog_hash_children);
            }
            out.push(s);
        });
        return out;
    }

    function neutralizeEmptyTgHttpManagers(tg) {
        if (!tg || !tg.http_managers || typeof tg.http_managers !== 'object') return;
        var hd = tg.http_managers.http_defaults;
        if (hd && typeof hd === 'object' && isEmptyHttpDefaultsData(hd)) {
            hd.enabled = false;
        }
        if (Array.isArray(tg.http_managers.selected_types) && hd && hd.enabled === false) {
            tg.http_managers.selected_types = tg.http_managers.selected_types.filter(function (t) {
                return t !== 'http_defaults';
            });
        }
        if (Array.isArray(tg.config_items)) {
            tg.config_items = tg.config_items.filter(function (it) {
                if (!it || it.type !== 'http_defaults') return true;
                var nm = it.name || '';
                if (nm && !SYNTH_HTTP_NAMES[nm]) return true;
                return !isEmptyHttpDefaultsData(it.data || {});
            });
        }
    }

    function forEachThreadGroup(model, fn) {
        if (!model || typeof fn !== 'function') return;
        ['setup_thread_groups', 'thread_groups', 'post_thread_groups'].forEach(function (k) {
            (model[k] || []).forEach(fn);
        });
        (model.test_plans || []).forEach(function (plan) {
            (plan.thread_groups || []).forEach(fn);
            (plan.setup_thread_groups || []).forEach(fn);
            (plan.post_thread_groups || []).forEach(fn);
        });
    }

    function stripEmptyTgHttpDefaults(model) {
        if (!model) return model;
        forEachThreadGroup(model, function (tg) {
            neutralizeEmptyTgHttpManagers(tg);
            if (Array.isArray(tg.steps)) tg.steps = stripEmptyHttpDefaultsFromSteps(tg.steps);
        });
        return model;
    }

    function sanitizeModel(model) {
        if (!model || typeof model !== 'object') return model;
        model._jmx_import_fidelity = true;
        model.base_url = '';
        model.influxdb = emptyInflux();
        if (Array.isArray(model.plan_catalog_items)) {
            model.plan_catalog_items = model.plan_catalog_items.filter(function (it) {
                return !isSyntheticSceneItem(it);
            });
        }
        stripEmptyTgHttpDefaults(model);
        return model;
    }

    function wrapFidelityGuard(R, key) {
        if (!R) return;
        var fn = R[key];
        if (typeof fn !== 'function' || fn.__jmxFidelityGuardV4) return;
        var wrapped = function (model) {
            if (hasFidelityFlag(model)) {
                if (key === 'migrateLegacySceneToCatalog' || key === 'migrateLegacySceneDataToCatalog') return false;
                if (key === 'syncSceneFieldsToCatalog') return false;
            }
            return fn.call(R, model);
        };
        wrapped.__jmxFidelityGuardV4 = true;
        R[key] = wrapped;
    }

    function patchSceneResolve() {
        var R = global.JmsPlanCatalogResolve;
        if (!R) return;
        wrapFidelityGuard(R, 'migrateLegacySceneToCatalog');
        wrapFidelityGuard(R, 'migrateLegacySceneDataToCatalog');
        wrapFidelityGuard(R, 'syncSceneFieldsToCatalog');
    }

    function patchScenarioNormalize() {
        var N = global.JmsScenarioNormalize;
        if (!N || N.__jmxImportFidelityNormV4) return;
        N.__jmxImportFidelityNormV4 = true;

        var origModel = N.normalizeModel;
        N.normalizeModel = function (model, opts) {
            if (model && (global.__jmxImportFidelityActive || hasFidelityFlag(model))) {
                model._jmx_import_fidelity = true;
                model.base_url = '';
                model.influxdb = emptyInflux();
            }
            var out = origModel.call(N, model, opts);
            if (out && (hasFidelityFlag(out) || global.__jmxImportFidelityActive)) {
                sanitizeModel(out);
            }
            return out;
        };

        var origScenario = N.normalizeScenarioData;
        if (typeof origScenario === 'function') {
            N.normalizeScenarioData = function (scenario, opts) {
                sanitizeScenario(scenario);
                var out = origScenario.call(N, scenario, opts);
                return sanitizeScenario(out);
            };
        }
    }

    function patchCatalogBridge() {
        var B = global.JmsJmxImportCatalogBridge;
        if (!B || B.__jmxImportFidelityBridgeV4) return;
        B.__jmxImportFidelityBridgeV4 = true;

        var origToModel = B.scenarioToModel;
        if (typeof origToModel === 'function') {
            B.scenarioToModel = function (scenario) {
                var model = origToModel.call(B, scenario);
                if (hasFidelityFlag(scenario) && model) {
                    model._jmx_import_fidelity = true;
                }
                return model;
            };
        }

        var origPrepare = B.prepareScenario;
        B.prepareScenario = function (scenario) {
            sanitizeScenario(scenario);
            var out = origPrepare.call(B, scenario);
            return sanitizeScenario(out);
        };
    }

    function patchParser() {
        var P = global.JmxImportParser;
        if (!P || P.__jmxImportFidelityParserV6) return;
        P.__jmxImportFidelityParserV6 = true;
        if (typeof P.parseJmxXml === 'function') {
            var inner = P.parseJmxXml;
            P.parseJmxXml = function (xml, opts) {
                return sanitizeScenario(inner.call(P, xml, opts));
            };
        }
        if (typeof P.scenarioToYaml === 'function') {
            var innerYaml = P.scenarioToYaml;
            P.scenarioToYaml = function (scenario) {
                return innerYaml.call(P, sanitizeScenario(scenario));
            };
        }
        if (typeof P.parseFileAsync === 'function') {
            var innerAsync = P.parseFileAsync;
            P.parseFileAsync = function (file, callbacks) {
                callbacks = callbacks || {};
                var origSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function (result) {
                    if (result) {
                        if (result.scenario) sanitizeScenario(result.scenario);
                        if (result.yaml) {
                            result.yaml = ensureFidelityInYamlText(result.yaml);
                            if (global.jsyaml) {
                                try {
                                    var data = global.jsyaml.load(result.yaml);
                                    if (!hasFidelityFlag(data)) sanitizeYamlData(data);
                                    result.yaml = global.jsyaml.dump(data, { lineWidth: 120, noRefs: true });
                                } catch (e) { /* ignore */ }
                            }
                        }
                    }
                    if (origSuccess) origSuccess(result);
                };
                return innerAsync.call(P, file, callbacks);
            };
        }
    }

    function patchVisualBuilder() {
        var VB = global.JmsVisualBuilder;
        if (!VB) return false;
        var patched = false;

        if (typeof VB.loadTemplate === 'function' && !VB.__jmxImportFidelityLoadV4) {
            VB.__jmxImportFidelityLoadV4 = true;
            var origLoad = VB.loadTemplate;
        VB.loadTemplate = function (yamlText) {
            yamlText = ensureFidelityInYamlText(yamlText);
            var fidelity = false;
            var mPrev = VB.getModel && VB.getModel();
            try {
                if (global.jsyaml && yamlText) {
                    var data = global.jsyaml.load(yamlText);
                    fidelity = hasFidelityFlag(data) || hasFidelityFlag(mPrev);
                    if (fidelity) {
                        sanitizeYamlData(data);
                        yamlText = global.jsyaml.dump(data, { lineWidth: 120, noRefs: true });
                    }
                }
            } catch (e) { /* ignore */ }
            if (!fidelity && hasFidelityFlag(mPrev)) fidelity = true;

                global.__jmxImportFidelityActive = fidelity;
                try {
                    origLoad.call(VB, yamlText);
                } finally {
                    global.__jmxImportFidelityActive = false;
                }
                if (!fidelity) return;
                var m = VB.getModel && VB.getModel();
                if (!m) return;
                sanitizeModel(m);
                if (typeof VB.syncYamlFromModel === 'function') VB.syncYamlFromModel();
                if (typeof VB.triggerRender === 'function') VB.triggerRender();
            };
            patched = true;
        }

        if (typeof VB.syncYamlFromModel === 'function' && !VB.__jmxImportFidelitySyncV4) {
            VB.__jmxImportFidelitySyncV4 = true;
            var origSync = VB.syncYamlFromModel;
            VB.syncYamlFromModel = function () {
                var m = VB.getModel && VB.getModel();
                origSync.call(VB);
                stampYamlInputFromModel(m);
            };
            patched = true;
        }

        return patched;
    }

    function patchEditorModeSwitch() {
        if (global.__jmxImportFidelityEditorModeV4) return;
        global.__jmxImportFidelityEditorModeV4 = true;
        if (!global.document || typeof global.document.addEventListener !== 'function') return;

        global.document.addEventListener('click', function (ev) {
            var btn = ev.target && ev.target.closest
                ? ev.target.closest('.jms-editor-mode-btn[data-mode="visual"]')
                : null;
            if (!btn || btn.classList.contains('is-active')) return;
            var VB = global.JmsVisualBuilder;
            var m = VB && typeof VB.getModel === 'function' ? VB.getModel() : null;
            if (!hasFidelityFlag(m)) return;
            stampYamlInputFromModel(m);
            global.__jmxImportFidelityActive = true;
            setTimeout(function () {
                global.__jmxImportFidelityActive = false;
                if (VB && typeof VB.getModel === 'function') {
                    var cur = VB.getModel();
                    if (hasFidelityFlag(cur)) sanitizeModel(cur);
                }
            }, 0);
        }, true);
    }

    function patchImportFinish() {
        var T = global.JmsTgTreeShell;
        if (!T || typeof T.syncAll !== 'function' || T.__jmxFidelitySyncAllV5) return;
        T.__jmxFidelitySyncAllV5 = true;
        var origSyncAll = T.syncAll;
        T.syncAll = function (forceFull) {
            origSyncAll.call(T, forceFull);
            var VB = global.JmsVisualBuilder;
            var m = VB && typeof VB.getModel === 'function' ? VB.getModel() : null;
            if (m && hasFidelityFlag(m)) {
                sanitizeModel(m);
            }
        };
    }

    function patchApplyScenarioYaml() {
        var S = global.JmsScenarioStudio;
        if (!S || typeof S.applyScenarioYaml !== 'function' || S.__jmxFidelityApplyV5) return true;
        S.__jmxFidelityApplyV5 = true;
        var orig = S.applyScenarioYaml;
        S.applyScenarioYaml = function (yamlText) {
            yamlText = ensureFidelityInYamlText(yamlText);
            var active = false;
            try {
                if (global.jsyaml && yamlText) active = hasFidelityFlag(global.jsyaml.load(yamlText));
            } catch (e) { /* ignore */ }
            global.__jmxImportFidelityActive = active;
            try {
                orig.call(this, yamlText);
            } finally {
                global.__jmxImportFidelityActive = false;
            }
            var VB = global.JmsVisualBuilder;
            var m = VB && typeof VB.getModel === 'function' ? VB.getModel() : null;
            if (m && (active || hasFidelityFlag(m))) sanitizeModel(m);
            if (VB && typeof VB.triggerRender === 'function') VB.triggerRender();
        };
        return true;
    }

    var applyPatchAttempts = 0;

    function patchApplyScenarioYamlRetry() {
        if (patchApplyScenarioYaml()) return;
        applyPatchAttempts += 1;
        if (applyPatchAttempts < 320) setTimeout(patchApplyScenarioYamlRetry, 32);
    }

    var vbPatchAttempts = 0;


    function patchLegacyPurgeEmptyTgHd() {
        var P = global.JmsCatalogLegacyPurge;
        if (!P || typeof P.enrichThreadGroupBeforeCatalog !== 'function' || P.__jmxFidelityEmptyTgHdV1) return;
        P.__jmxFidelityEmptyTgHdV1 = true;
        var orig = P.enrichThreadGroupBeforeCatalog;
        P.enrichThreadGroupBeforeCatalog = function (tg) {
            if (global.__jmxImportFidelityActive) {
                neutralizeEmptyTgHttpManagers(tg);
            }
            orig.call(P, tg);
            if (global.__jmxImportFidelityActive) {
                neutralizeEmptyTgHttpManagers(tg);
            }
        };
    }

    function boot() {
        patchSceneResolve();
        patchScenarioNormalize();
        patchCatalogBridge();
        patchLegacyPurgeEmptyTgHd();
        patchParser();
        patchEditorModeSwitch();
        patchImportFinish();
        patchApplyScenarioYamlRetry();
        if (!patchVisualBuilder()) {
            vbPatchAttempts += 1;
            if (vbPatchAttempts < 320) setTimeout(boot, 32);
        }
    }

    function scheduleReapply() {
        boot();
        setTimeout(boot, 0);
        setTimeout(boot, 120);
    }

    global.JmsJmxImportFidelityV1 = {
        sanitizeScenario: sanitizeScenario,
        sanitizeModel: sanitizeModel,
        sanitizeYamlData: sanitizeYamlData,
        ensureFidelityInYamlText: ensureFidelityInYamlText,
        isSyntheticSceneItem: isSyntheticSceneItem,
        patch: boot,
        reapply: scheduleReapply
    };

    function scheduleBoot() {
        if (global.JmsPlanCatalogResolve && global.JmsScenarioNormalize) {
            scheduleReapply();
            return;
        }
        setTimeout(scheduleBoot, 16);
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', scheduleBoot);
    } else {
        scheduleBoot();
    }
    if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', scheduleReapply);
    }
}(typeof window !== 'undefined' ? window : this));
