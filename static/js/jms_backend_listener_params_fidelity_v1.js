/**
 * BackendListener Parameters 保真 · 禁止自动注入非官方字段 influxdbDatabase
 *
 * 背景：jms_catalog_editor_schema_official_gui_v1 的 ensureOfficialInfluxExtras
 * 会把 influxdbDatabase 补进参数表，导致导入后 9 项变成 10 项。
 * 本模块在其后加载，包装 mergeParamsForClassname：仅当源参数已含该键时保留。
 */
(function (global) {
    'use strict';

    var PHANTOM_KEYS = { influxdbDatabase: 1 };

    function hasKey(params, key) {
        var hit = false;
        (params || []).forEach(function (p) {
            if (!p) return;
            var k = String(p.key || p.name || '').trim();
            if (k === key) hit = true;
        });
        return hit;
    }

    function stripPhantomsUnlessPresent(merged, sourceParams) {
        var src = sourceParams || [];
        return (merged || []).filter(function (p) {
            if (!p) return false;
            var k = String(p.key || p.name || '').trim();
            if (!k) return false;
            if (PHANTOM_KEYS[k] && !hasKey(src, k)) return false;
            return true;
        });
    }

    /** 新方法：按官方默认键合并，绝不注入幽灵字段 */
    function mergeParamsForClassnameFidelity(classname, params) {
        var C = global.JmsBackendListenerCatalog;
        var defaults = C && typeof C.defaultParamsForClassname === 'function'
            ? C.defaultParamsForClassname(classname)
            : [];
        var map = {};
        (params || []).forEach(function (p) {
            if (!p) return;
            var k = String(p.key || p.name || '').trim();
            if (k) map[k] = p.value == null ? '' : String(p.value);
        });
        var out = (defaults || []).map(function (d) {
            return {
                key: d.key,
                value: Object.prototype.hasOwnProperty.call(map, d.key) ? map[d.key] : d.value
            };
        });
        Object.keys(map).forEach(function (k) {
            if (!(defaults || []).some(function (d) { return d.key === k; })) {
                // 保留源里出现的非默认键（含用户手写的 influxdbDatabase）
                out.push({ key: k, value: map[k] });
            }
        });
        return out;
    }

    function patchOfficialGui() {
        var O = global.JmsCatalogEditorSchemaOfficialGuiV1;
        if (!O || O.__paramsFidelityV1) return false;
        O.__paramsFidelityV1 = true;

        if (typeof O.mergeParamsForClassname === 'function') {
            var orig = O.mergeParamsForClassname;
            O.mergeParamsForClassname = function (classname, params) {
                // 优先走保真合并，避免 ensureOfficialInfluxExtras
                try {
                    return mergeParamsForClassnameFidelity(classname, params);
                } catch (e) {
                    var merged = orig.call(O, classname, params);
                    return stripPhantomsUnlessPresent(merged, params);
                }
            };
        }

        if (typeof O.ensureOfficialInfluxExtras === 'function') {
            O.ensureOfficialInfluxExtras = function (_classname, params) {
                return params || [];
            };
        }

        return true;
    }

    function install() {
        if (patchOfficialGui()) return;
        var n = 0;
        var t = setInterval(function () {
            n += 1;
            if (patchOfficialGui() || n > 40) clearInterval(t);
        }, 100);
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', install);
    } else {
        setTimeout(install, 0);
    }

    global.JmsBackendListenerParamsFidelityV1 = {
        install: install,
        patchOfficialGui: patchOfficialGui,
        mergeParamsForClassnameFidelity: mergeParamsForClassnameFidelity,
        stripPhantomsUnlessPresent: stripPhantomsUnlessPresent
    };
})(typeof window !== 'undefined' ? window : this);
