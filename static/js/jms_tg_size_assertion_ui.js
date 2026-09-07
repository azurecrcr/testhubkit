/**
 * 线程组 · 大小断言弹窗（v1 · 独立模块 · #modal-tg-size-assert-edit）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-size-assert-edit';
    var UI_VERSION = '3';

    var APPLY_TO_OPTIONS = [
        { val: 'main_and_sub', label: 'Main sample and sub-samples' },
        { val: 'main_only', label: 'Main sample only' },
        { val: 'sub_only', label: 'Sub-samples only' },
        { val: 'jmeter_variable', label: 'JMeter Variable Name to use' }
    ];

    var TEST_FIELD_OPTIONS = [
        { val: 'full_response', label: 'Full Response' },
        { val: 'response_headers', label: 'Response Headers' },
        { val: 'response_body', label: 'Response Body' },
        { val: 'response_code', label: '响应代码' },
        { val: 'response_message', label: '响应信息' }
    ];

    var OPERATOR_OPTIONS = [
        { val: 'eq', label: '=' },
        { val: 'ne', label: '!=' },
        { val: 'gt', label: '>' },
        { val: 'lt', label: '<' },
        { val: 'ge', label: '>=' },
        { val: 'le', label: '<=' }
    ];

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(planId, tgId) {
        var H = global.JmsTgAssertHelpers;
        return H && typeof H.findTg === 'function' ? H.findTg(planId, tgId) : null;
    }

    function ensureAssertions(tg) {
        var H = global.JmsTgAssertHelpers;
        return H && typeof H.ensureTgAssertions === 'function' ? H.ensureTgAssertions(tg) : [];
    }

    function defaultName(index) {
        return '大小断言' + (index ? ' ' + index : '');
    }

    function defaultAssertion(index) {
        return {
            type: 'size_assert',
            name: defaultName(index),
            comments: '',
            enabled: true,
            apply_to: 'main_only',
            jmeter_variable: '',
            test_field: 'full_response',
            size_bytes: '',
            compare_operator: 'eq'
        };
    }

    function renderLabel(text) {
        return '<span class="jms-tg-sa-v1__label">' + esc(text) + '</span>';
    }

    function renderRadioGroup(name, options, current, field) {
        return '<div class="jms-tg-sa-v1__radio-grid" data-sa-field="' + field + '">' +
            options.map(function (o) {
                return '<label class="jms-tg-sa-v1__radio">' +
                    '<input type="radio" name="' + esc(name) + '" value="' + esc(o.val) + '"' +
                    (current === o.val ? ' checked' : '') + '>' +
                    '<span>' + esc(o.label) + '</span></label>';
            }).join('') + '</div>';
    }

    function renderOperatorGroup(current) {
        return '<div class="jms-tg-sa-v1__op-grid" data-sa-field="compare_operator">' +
            OPERATOR_OPTIONS.map(function (o) {
                return '<label class="jms-tg-sa-v1__op">' +
                    '<input type="radio" name="sa-compare-op" value="' + esc(o.val) + '"' +
                    (current === o.val ? ' checked' : '') + '>' +
                    '<span>' + esc(o.label) + '</span></label>';
            }).join('') + '</div>';
    }

    function renderAssertionBody(d) {
        d = d || defaultAssertion(0);
        var applyTo = d.apply_to || 'main_only';
        return '<div class="jms-tg-sa-v1" data-tg-sa-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-tg-sa-v1__grid jms-tg-sa-v1__grid--meta">' +
            '<label class="jms-tg-sa-v1__field">' + renderLabel('名称') +
            '<input type="text" class="jms-tg-sa-v1__input" data-sa-field="name" value="' + esc(d.name || '') + '" autocomplete="off">' +
            '</label>' +
            '<label class="jms-tg-sa-v1__field">' + renderLabel('注释') +
            '<input type="text" class="jms-tg-sa-v1__input" data-sa-field="comments" value="' + esc(d.comments || '') + '" autocomplete="off">' +
            '</label></div>' +
            '<section class="jms-tg-sa-v1__card">' +
            '<h4 class="jms-tg-sa-v1__card-title">Apply to</h4>' +
            renderRadioGroup('sa-apply-to', APPLY_TO_OPTIONS, applyTo, 'apply_to') +
            '<label class="jms-tg-sa-v1__field jms-tg-sa-v1__field--var' +
            (applyTo === 'jmeter_variable' ? '' : ' is-hidden') + '" data-sa-var-wrap>' +
            renderLabel('Variable Name') +
            '<input type="text" class="jms-tg-sa-v1__input hf-mono" data-sa-field="jmeter_variable" value="' +
            esc(d.jmeter_variable || '') + '" autocomplete="off">' +
            '</label></section>' +
            '<section class="jms-tg-sa-v1__card">' +
            '<h4 class="jms-tg-sa-v1__card-title">Response Size Field to Test</h4>' +
            renderRadioGroup('sa-test-field', TEST_FIELD_OPTIONS, d.test_field || 'full_response', 'test_field') +
            '</section>' +
            '<section class="jms-tg-sa-v1__card jms-tg-sa-v1__card--size">' +
            '<h4 class="jms-tg-sa-v1__card-title">Size to Assert</h4>' +
            '<div class="jms-tg-sa-v1__size-row">' +
            '<label class="jms-tg-sa-v1__field jms-tg-sa-v1__field--bytes">' + renderLabel('字节大小') +
            '<input type="text" class="jms-tg-sa-v1__input jms-tg-sa-v1__input--bytes hf-mono" data-sa-field="size_bytes" value="' +
            esc(d.size_bytes != null ? String(d.size_bytes) : '') + '" autocomplete="off" inputmode="numeric">' +
            '</label>' +
            '<div class="jms-tg-sa-v1__field jms-tg-sa-v1__field--op">' + renderLabel('比较类型') +
            renderOperatorGroup(d.compare_operator || 'eq') +
            '</div></div></section></div>';
    }

    function readRadioField(body, field) {
        var wrap = body.querySelector('[data-sa-field="' + field + '"]');
        if (!wrap) return '';
        var checked = wrap.querySelector('input[type="radio"]:checked');
        return checked ? checked.value : '';
    }

    function readAssertionBody(body, modal) {
        body = body || global.document;
        modal = modal || (body.closest ? body.closest('#' + MODAL_ID) : null);
        function txt(name) {
            var el = body.querySelector('input[data-sa-field="' + name + '"], textarea[data-sa-field="' + name + '"]');
            return el ? el.value : '';
        }
        return {
            name: String(txt('name') || '').trim() || '大小断言',
            comments: String(txt('comments') || ''),
            apply_to: readRadioField(body, 'apply_to') || 'main_only',
            jmeter_variable: String(txt('jmeter_variable') || '').trim(),
            test_field: readRadioField(body, 'test_field') || 'full_response',
            size_bytes: String(txt('size_bytes') || '').trim(),
            compare_operator: readRadioField(body, 'compare_operator') || 'eq'
        };
    }

    function syncVarField(modal, show) {
        if (!modal) return;
        var wrap = modal.querySelector('[data-sa-var-wrap]');
        if (wrap) wrap.classList.toggle('is-hidden', !show);
    }

    function markDirtyAndRefreshDetail(planId, tgId) {
        var H = global.JmsTgAssertHelpers;
        if (H && typeof H.markDirtyAndRefreshTg === 'function') H.markDirtyAndRefreshTg(planId, tgId);
    }

    function hideModal(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-plan-id');
        modal.removeAttribute('data-tg-id');
                modal.removeAttribute('data-assert-mode');
        modal.removeAttribute('data-assert-index');
        if (global.JmsIfMountSaveHelper && typeof global.JmsIfMountSaveHelper.clearIfMountAttrs === 'function') {
            global.JmsIfMountSaveHelper.clearIfMountAttrs(modal);
        }
        if (global.JmsAssertCreateCancelRollback && typeof global.JmsAssertCreateCancelRollback.clearPendingAttrs === 'function') {
            global.JmsAssertCreateCancelRollback.clearPendingAttrs(modal);
        }
    }

    function cancelModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;
        var R = global.JmsAssertCreateCancelRollback;
        if (R && typeof R.rollbackPending === 'function') {
            var planId = modal.getAttribute('data-plan-id');
            var tgId = modal.getAttribute('data-tg-id');
            var ifStepId = modal.getAttribute('data-if-mount-if-step-id');
            R.rollbackPending(modal, {
                assertType: 'size_assert',
                getList: function () {
                    if (ifStepId) {
                        var H = global.JmsIfMountSaveHelper;
                        var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
                        if (!ifStep) return null;
                        if (!Array.isArray(ifStep.assertions)) ifStep.assertions = [];
                        return ifStep.assertions;
                    }
                    var tg = findTg(planId, tgId);
                    return tg ? ensureAssertions(tg) : null;
                },
                afterRemove: function () {
                    if (ifStepId) {
                        var H2 = global.JmsIfMountSaveHelper;
                        var ifStep2 = H2 && typeof H2.getIf === 'function' ? H2.getIf(planId, tgId, ifStepId) : null;
                        if (ifStep2) {
                            var TL = global.JmsIfMountTimeline;
                            if (TL && typeof TL.reconcileMountKeysAfterDelete === 'function') {
                                TL.reconcileMountKeysAfterDelete(ifStep2);
                            }
                            H2.markDirty(planId, tgId, ifStepId);
                        }
                    } else if (planId && tgId) {
                        markDirtyAndRefreshDetail(planId, tgId);
                    }
                }
            });
        }
        hideModal(modal);
    }

    function onModalClick(ev) {
        var modal = ev.target.closest('#' + MODAL_ID);
        if (!modal) return;
        if (ev.target === modal) cancelModal();
    }

    function onModalChange(ev) {
        var modal = ev.target.closest('#' + MODAL_ID);
        if (!modal) return;
        if (ev.target.matches('input[name="sa-apply-to"]')) {
            syncVarField(modal, ev.target.value === 'jmeter_variable');
        }
    }

    function ensureDrawer() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-tg-sa-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-tg-sa-drawer__panel">' +
            '<div class="jms-tg-sa-drawer__head">' +
            '<div class="jms-tg-sa-drawer__head-main">' +
            '<span class="jms-tg-sa-drawer__badge">Assertion</span>' +
            '<h3 class="jms-step-modal__title">大小断言</h3></div>' +
            '<button type="button" class="jms-tg-sa-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-tg-sa-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-tg-sa-drawer__foot">' +            '<div class="jms-tg-sa-drawer__foot-actions">' +
            '<button type="button" class="jms-btn-ghost jms-tg-sa-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-sa-drawer__save">保存</button>' +
            '</div></div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', onModalClick);
        modal.addEventListener('change', onModalChange);
        modal.querySelector('.jms-tg-sa-drawer__close').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-sa-drawer__cancel').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-sa-drawer__save').addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            saveModal();
        }, true);
        return modal;
    }

    function openModal(assertion) {
        var modal = ensureDrawer();
        var bodyEl = modal.querySelector('.jms-tg-sa-drawer__body');
        if (bodyEl) bodyEl.innerHTML = renderAssertionBody(assertion);
        syncVarField(modal, (assertion && assertion.apply_to) === 'jmeter_variable');
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
        if (global.JmsAssertValidationNotice && typeof global.JmsAssertValidationNotice.clear === 'function') {
            global.JmsAssertValidationNotice.clear(modal);
        }
    }

    function setModalContext(modal, planId, tgId, mode, assertIndex) {
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
                modal.setAttribute('data-assert-mode', mode);
        if (mode === 'edit') modal.setAttribute('data-assert-index', String(assertIndex));
        else modal.removeAttribute('data-assert-index');
    }

    function applyFieldsToAssertion(item, fields) {
        item.type = 'size_assert';
        item.name = fields.name;
        item.comments = fields.comments;
        item.enabled = (global.JmsAssertEnableUi && typeof global.JmsAssertEnableUi.resolveEnabledForSave === 'function')

            ? global.JmsAssertEnableUi.resolveEnabledForSave(item, fields)

            : (fields.enabled !== false);
        item.apply_to = fields.apply_to;
        item.jmeter_variable = fields.jmeter_variable;
        item.test_field = fields.test_field;
        item.size_bytes = fields.size_bytes;
        item.compare_operator = fields.compare_operator;
        return item;
    }

    function notifySizeValidation(modal, code) {
        if (global.JmsAssertValidationNotice &&
            typeof global.JmsAssertValidationNotice.notifySizeSave === 'function') {
            global.JmsAssertValidationNotice.notifySizeSave(modal, code, 'tg');
            return;
        }
        var msgs = {
            bytes_empty: '请填写字节大小。',
            bytes_invalid: '字节大小必须为数字。',
            var_empty: '请填写 JMeter 变量名。'
        };
        global.alert(msgs[code] || '');
    }

    function saveModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var mode = modal.getAttribute('data-assert-mode');
        var bodyEl = modal.querySelector('.jms-tg-sa-drawer__body');
        var fields = readAssertionBody(bodyEl, modal);
        var existingForEnable = null;
        if (mode === 'edit') {
            var idxEn = parseInt(modal.getAttribute('data-assert-index'), 10);
            if (ifStepId) {
                var HEn = global.JmsIfMountSaveHelper;
                var ifEn = HEn && typeof HEn.getIf === 'function' ? HEn.getIf(planId, tgId, ifStepId) : null;
                if (ifEn && Array.isArray(ifEn.assertions)) existingForEnable = ifEn.assertions[idxEn];
            } else {
                var tgEn = findTg(planId, tgId);
                if (tgEn) {
                    var listEn = ensureAssertions(tgEn);
                    existingForEnable = listEn[idxEn];
                }
            }
        }

        fields.enabled = global.JmsAssertEnableUi && typeof global.JmsAssertEnableUi.resolveEnabledForSave === 'function'
            ? global.JmsAssertEnableUi.resolveEnabledForSave(existingForEnable, fields)
            : true;
        if (fields.enabled) {
            if (!fields.size_bytes) {
                notifySizeValidation(modal, 'bytes_empty');
                return;
            }
            if (isNaN(Number(fields.size_bytes))) {
                notifySizeValidation(modal, 'bytes_invalid');
                return;
            }
            if (fields.apply_to === 'jmeter_variable' && !fields.jmeter_variable) {
                notifySizeValidation(modal, 'var_empty');
                return;
            }
        }
        var ifStepId = modal.getAttribute('data-if-mount-if-step-id');
        if (ifStepId) {
            var H = global.JmsIfMountSaveHelper;
            var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
            if (!ifStep) return;
            if (!Array.isArray(ifStep.assertions)) ifStep.assertions = [];
            var listIf = ifStep.assertions;
            if (mode === 'create') {
                var R = global.JmsAssertCreateCancelRollback;
                var itemIf = R && typeof R.resolvePendingItem === 'function'
                    ? R.resolvePendingItem(modal, listIf, 'size_assert')
                    : null;
                if (!itemIf) {
                    itemIf = defaultAssertion(listIf.filter(function (a) {
                        return a && a.type === 'size_assert';
                    }).length + 1);
                    listIf.push(itemIf);
                    if (H && typeof H.notifyMountAdded === 'function') H.notifyMountAdded(ifStep, 'ifas:' + (listIf.length - 1));
                }
                applyFieldsToAssertion(itemIf, fields);
                if (R && typeof R.commitPending === 'function') R.commitPending(modal);
            } else {
                var idxIf = parseInt(modal.getAttribute('data-assert-index'), 10);
                var existingIf = listIf[idxIf];
                if (!existingIf || existingIf.type !== 'size_assert') return;
                applyFieldsToAssertion(existingIf, fields);
            }
            hideModal(modal);
            H.markDirty(planId, tgId, ifStepId);
            return;
        }
        var tg = findTg(planId, tgId);
        if (!tg) return;
        var list = ensureAssertions(tg);
        if (mode === 'create') {
            var R = global.JmsAssertCreateCancelRollback;
            var item = R && typeof R.resolvePendingItem === 'function'
                ? R.resolvePendingItem(modal, list, 'size_assert')
                : null;
            if (!item) {
                item = defaultAssertion(list.filter(function (a) {
                    return a && a.type === 'size_assert';
                }).length + 1);
                list.push(item);
                if (global.JmsTgDetailTimeline && typeof global.JmsTgDetailTimeline.assignAppendTimelineOrder === 'function') {
                    global.JmsTgDetailTimeline.assignAppendTimelineOrder(tg, item);
                }
            }
            applyFieldsToAssertion(item, fields);
            if (R && typeof R.commitPending === 'function') R.commitPending(modal);
        } else {
            var idx = parseInt(modal.getAttribute('data-assert-index'), 10);
            var existing = list[idx];
            if (!existing || existing.type !== 'size_assert') return;
            applyFieldsToAssertion(existing, fields);
        }
        hideModal(modal);
        markDirtyAndRefreshDetail(planId, tgId);
    }

    function openCreate(planId, tgId) {
        var tg = findTg(planId, tgId);
        if (!tg) return;
        var modal = ensureDrawer();
        var n = ensureAssertions(tg).filter(function (a) { return a && a.type === 'size_assert'; }).length + 1;
        var draft = defaultAssertion(n);
        var R = global.JmsAssertCreateCancelRollback;
        if (R && typeof R.appendDraft === 'function') {
            R.readModelFromDom();
            R.appendDraft(modal, ensureAssertions(tg), draft, { assignTimeline: true, tg: tg });
            markDirtyAndRefreshDetail(planId, tgId);
        }
        setModalContext(modal, planId, tgId, 'create', -1);
        openModal(draft);
    }

    function openCreateForIfMount(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
        if (!ifStep) return;
        var modal = ensureDrawer();
        var n = (ifStep.assertions || []).filter(function (a) { return a && a.type === 'size_assert'; }).length + 1;
        var draft = defaultAssertion(n);
        var R = global.JmsAssertCreateCancelRollback;
        if (R && typeof R.appendDraft === 'function') {
            R.readModelFromDom();
            if (!Array.isArray(ifStep.assertions)) ifStep.assertions = [];
            R.appendDraft(modal, ifStep.assertions, draft, { notifyIfMount: true, ifStep: ifStep });
            H.markDirty(planId, tgId, ifStepId);
        }
        setModalContext(modal, planId, tgId, 'create', -1);
        modal.setAttribute('data-if-mount-if-step-id', ifStepId);
        openModal(draft);
    }

    function openEdit(planId, tgId, assertIndex) {
        var tg = findTg(planId, tgId);
        var item = tg && ensureAssertions(tg)[assertIndex];
        if (!item || item.type !== 'size_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        openModal(item);
    }


    function openEditForIfMount(planId, tgId, ifStepId, assertIndex) {
        var H = global.JmsIfMountSaveHelper;
        var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
        if (!ifStep) return;
        var item = (ifStep.assertions || [])[assertIndex];
        if (!item || item.type !== 'size_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        modal.setAttribute('data-if-mount-if-step-id', ifStepId);
        openModal(item);
    }

    global.JmsTgSizeAssertionUi = {
        ensureDrawer: ensureDrawer,
        openCreate: openCreate,
        openCreateForIfMount: openCreateForIfMount,
        openEditForIfMount: openEditForIfMount,
        openEdit: openEdit,
        defaultAssertion: defaultAssertion
    };
}(typeof window !== 'undefined' ? window : this));
