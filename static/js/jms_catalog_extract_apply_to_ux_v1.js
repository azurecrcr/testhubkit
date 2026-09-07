/**
 * catalog 编辑器 · 提取器/断言 Apply to / Variable 联动（隔离模块 v2）
 * 根治：按 schema 自动识别含 apply_to + Variable 的组件，不再依赖 alias 白名单。
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'jms-catalog-element-editor-modal';

    function modal() {
        return global.document.getElementById(MODAL_ID);
    }

    function dynRoot(m) {
        return m && m.querySelector('[data-catalog-editor-dynamic]');
    }

    function schemaApi() {
        return global.JmsCatalogElementEditorSchema;
    }

    function fieldEl(root, key) {
        return root ? root.querySelector('[data-dyn-input="1"][data-key="' + key + '"]') : null;
    }

    function fieldWrap(root, key) {
        return root ? root.querySelector('[data-field-key="' + key + '"]') : null;
    }

    function currentStep(m) {
        var visual = global.JmsVisualBuilder;
        var UI = global.JmsCatalogElementEditorUi;
        if (!m || !visual || !UI || typeof UI.locateStep !== 'function' || typeof visual.getModel !== 'function') {
            return null;
        }
        var stepId = m.getAttribute('data-step-id');
        if (!stepId) return null;
        if (m.getAttribute('data-plan-level') === '1') return null;
        var planId = m.getAttribute('data-plan-id');
        var tgId = m.getAttribute('data-tg-id');
        var samplerId = m.getAttribute('data-sampler-step-id') || '';
        var loc = UI.locateStep(visual.getModel(), planId, tgId, stepId, { samplerStepId: samplerId });
        return loc && loc.step ? loc.step : null;
    }

    function resolveContextStep(m) {
        var step = currentStep(m);
        if (step) return step;
        if (!m) return null;
        var alias = m.getAttribute('data-catalog-editor-step-alias') || '';
        if (!alias) {
            var aliasEl = m.querySelector('[data-catalog-editor-alias]');
            if (aliasEl) alias = (aliasEl.textContent || '').split('·')[0].trim();
        }
        if (!alias) return null;
        return {
            alias: alias,
            category: m.getAttribute('data-catalog-editor-step-category') || 'postprocessor'
        };
    }

    function stashStepMeta(m, step) {
        if (!m || !step) return;
        if (step.alias) m.setAttribute('data-catalog-editor-step-alias', step.alias);
        if (step.category) m.setAttribute('data-catalog-editor-step-category', step.category);
    }

    /** 从 schema 解析 Apply to / Variable 字段配置 */
    function resolveApplyToConfig(step) {
        var S = schemaApi();
        if (!S || !step || typeof S.getSchema !== 'function') return null;
        var schema = S.getSchema(step);
        var fields = schema.fields || [];
        var applyField = null;
        var varField = null;
        var variableModeValue = 'variable';

        fields.forEach(function (f) {
            if (!f) return;
            if (f.key === 'apply_to') {
                applyField = f;
                (f.options || []).forEach(function (o) {
                    if (!o) return;
                    if (o.val === 'jmeter_variable') variableModeValue = 'jmeter_variable';
                    else if (o.val === 'variable') variableModeValue = 'variable';
                });
            }
            if (f.key === 'apply_to_variable') {
                varField = f;
                if (variableModeValue !== 'jmeter_variable') variableModeValue = 'variable';
            }
            if (f.key === 'jmeter_variable' && !varField) {
                varField = f;
                variableModeValue = 'jmeter_variable';
            }
        });

        if (!applyField || !varField) return null;
        return {
            applyKey: applyField.key,
            varKey: varField.key,
            variableModeValue: variableModeValue
        };
    }

    function normalizeApplyToValue(val) {
        var v = val == null ? '' : String(val);
        if (v === 'both') return 'all';
        return v;
    }

    function syncVariableFieldState(m, cfg) {
        cfg = cfg || resolveApplyToConfig(resolveContextStep(m));
        var root = dynRoot(m);
        if (!cfg || !root) return;
        var applySel = fieldEl(root, cfg.applyKey);
        var varInp = fieldEl(root, cfg.varKey);
        if (!varInp) return;
        var isVar = applySel && String(applySel.value) === String(cfg.variableModeValue);
        varInp.readOnly = !isVar;
        varInp.setAttribute('aria-readonly', isVar ? 'false' : 'true');
        var wrap = fieldWrap(root, cfg.varKey) || varInp.closest('.jms-field');
        if (wrap) {
            wrap.classList.toggle('is-apply-var-active', isVar);
            wrap.classList.toggle('is-apply-var-readonly', !isVar);
        }
    }

    function dispatchChange(el) {
        if (!el) return;
        try {
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            var ev = global.document.createEvent('Event');
            ev.initEvent('change', true, true);
            el.dispatchEvent(ev);
        }
    }

    function setApplyToVariable(m, cfg, focusVar) {
        cfg = cfg || resolveApplyToConfig(resolveContextStep(m));
        var root = dynRoot(m);
        if (!cfg || !root) return;
        var applySel = fieldEl(root, cfg.applyKey);
        if (!applySel) return;
        if (String(applySel.value) !== String(cfg.variableModeValue)) {
            applySel.value = cfg.variableModeValue;
            dispatchChange(applySel);
        }
        syncVariableFieldState(m, cfg);
        if (focusVar) {
            var varInp = fieldEl(root, cfg.varKey);
            if (varInp) {
                varInp.readOnly = false;
                varInp.removeAttribute('aria-readonly');
                try { varInp.focus({ preventScroll: true }); } catch (err) { varInp.focus(); }
            }
        }
    }

    function normalizeOpenProps(step, props) {
        if (!props) return props;
        var cfg = resolveApplyToConfig(step);
        if (!cfg) return props;
        if (props.apply_to != null) props.apply_to = normalizeApplyToValue(props.apply_to);
        var varVal = props[cfg.varKey];
        if (varVal != null && String(varVal).trim()) {
            props[cfg.applyKey] = cfg.variableModeValue;
        }
        return props;
    }

    function isVariableFieldTarget(target, cfg) {
        if (!target || !target.closest || !cfg) return false;
        return !!(
            target.closest('[data-dyn-input="1"][data-key="' + cfg.varKey + '"]') ||
            target.closest('[data-field-key="' + cfg.varKey + '"]')
        );
    }

    function onModalInteraction(ev) {
        var m = modal();
        if (!m || !m.classList.contains('jms-modal-open')) return;
        var step = resolveContextStep(m);
        var cfg = resolveApplyToConfig(step);
        if (!cfg) return;

        var target = ev.target;
        if (ev.type === 'focusin' || ev.type === 'click' || ev.type === 'mousedown') {
            if (isVariableFieldTarget(target, cfg)) {
                setApplyToVariable(m, cfg, ev.type === 'focusin' || ev.type === 'mousedown');
            }
        }
        if (ev.type === 'change') {
            if (target && target.getAttribute && target.getAttribute('data-key') === cfg.applyKey) {
                syncVariableFieldState(m, cfg);
            }
        }
    }

    function patchApplyToSchemaLabels() {
        var S = schemaApi();
        if (!S || S.__extractApplySchemaPatch || typeof S.getSchema !== 'function') return;
        var orig = S.getSchema;
        S.getSchema = function (step) {
            var schema = orig(step);
            if (!schema || !Array.isArray(schema.fields)) return schema;
            schema.fields.forEach(function (f) {
                if (!f || f.key !== 'apply_to' || !Array.isArray(f.options)) return;
                f.options = f.options.map(function (o) {
                    if (!o) return o;
                    var out = {};
                    Object.keys(o).forEach(function (k) { out[k] = o[k]; });
                    if (out.val === 'both') out.val = 'all';
                    if (out.val === 'variable' || out.val === 'jmeter_variable') {
                        out.label = 'JMeter Variable Name to use';
                    }
                    return out;
                });
            });
            return schema;
        };
        S.__extractApplySchemaPatch = true;
    }

    function wrapPropsForEditor() {
        var S = schemaApi();
        if (!S || S.__extractApplyUxWrapped || typeof S.propsForEditor !== 'function') return;
        var orig = S.propsForEditor;
        S.propsForEditor = function (step) {
            var props = orig(step);
            if (step && resolveApplyToConfig(step)) {
                props = normalizeOpenProps(step, props);
            }
            return props;
        };
        S.__extractApplyUxWrapped = true;
    }

    function patchEditorUiOpen() {
        var UI = global.JmsCatalogElementEditorUi;
        if (!UI || UI.__extractApplyUiOpenPatch) return;
        UI.__extractApplyUiOpenPatch = true;
        function afterOpen() {
            global.setTimeout(function () {
                var m = modal();
                if (m && m.classList.contains('jms-modal-open')) syncVariableFieldState(m);
            }, 60);
        }
        if (typeof UI.openForStep === 'function') {
            var origStep = UI.openForStep;
            UI.openForStep = function (planId, tgId, step, insertCtx) {
                var r = origStep.apply(UI, arguments);
                stashStepMeta(modal(), step);
                afterOpen();
                return r;
            };
        }
        if (typeof UI.openForCreate === 'function') {
            var origCreate = UI.openForCreate;
            UI.openForCreate = function (comp, insertCtx, catalogState) {
                var r = origCreate.apply(UI, arguments);
                afterOpen();
                return r;
            };
        }
    }

    function observeDynamicFields(m) {
        var dyn = m && m.querySelector('[data-catalog-editor-dynamic]');
        if (!dyn || dyn.dataset.jmsExtractApplyDynObs === '1') return;
        dyn.dataset.jmsExtractApplyDynObs = '1';
        var obs = new MutationObserver(function () {
            if (m.classList.contains('jms-modal-open')) syncVariableFieldState(m);
        });
        obs.observe(dyn, { childList: true, subtree: true });
    }

    function bind() {
        patchApplyToSchemaLabels();
        wrapPropsForEditor();
        patchEditorUiOpen();
        var m = modal();
        if (!m) return;
        observeDynamicFields(m);
        if (m.dataset.jmsExtractApplyUxBound === '1') return;
        m.dataset.jmsExtractApplyUxBound = '1';
        m.addEventListener('focusin', onModalInteraction, true);
        m.addEventListener('mousedown', onModalInteraction, true);
        m.addEventListener('click', onModalInteraction, true);
        m.addEventListener('change', onModalInteraction, true);
        var obs = new MutationObserver(function () {
            if (m.classList.contains('jms-modal-open')) syncVariableFieldState(m);
        });
        obs.observe(m, { attributes: true, attributeFilter: ['class'] });
    }

    function boot() {
        bind();
        if (!modal()) global.setTimeout(boot, 200);
    }

    global.JmsCatalogExtractApplyToUxV1 = {
        bind: bind,
        resolveApplyToConfig: resolveApplyToConfig,
        syncVariableFieldState: syncVariableFieldState,
        normalizeOpenProps: normalizeOpenProps,
        setApplyToVariable: setApplyToVariable
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));
