/**
 * 线程组 · JSON 断言弹窗（v1 · 独立模块 · #modal-tg-json-assert-edit）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-json-assert-edit';
    var UI_VERSION = '4';

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
        return 'JSON断言' + (index ? ' ' + index : '');
    }

    function defaultAssertion(index) {
        return {
            type: 'json_assert',
            name: defaultName(index),
            comments: '',
            enabled: true,
            json_path: '$.',
            additionally_assert_value: false,
            is_regex: true,
            expected: '',
            expect_null: false,
            invert: false
        };
    }

    function renderLabel(text, en) {
        return '<span class="jms-tg-ja-v2__label">' + esc(text) +
            (en ? '<span class="jms-tg-ja-v2__label-en">' + esc(en) + '</span>' : '') +
            '</span>';
    }

    function renderCheckboxChip(field, label, checked) {
        return '<label class="jms-tg-ja-v2__chip">' +
            '<input type="checkbox" data-ja-field="' + esc(field) + '"' + (checked ? ' checked' : '') + '>' +
            '<span>' + esc(label) + '</span></label>';
    }

    function renderAssertionBodyV2(d) {
        d = d || defaultAssertion(0);
        return '<div class="jms-tg-ja-v2" data-tg-ja-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-tg-ja-v2__grid jms-tg-ja-v2__grid--meta">' +
            '<label class="jms-tg-ja-v2__field">' + renderLabel('名称') +
            '<input type="text" class="jms-tg-ja-v2__input" data-ja-field="name" value="' + esc(d.name || '') + '" autocomplete="off">' +
            '</label>' +
            '<label class="jms-tg-ja-v2__field">' + renderLabel('注释') +
            '<input type="text" class="jms-tg-ja-v2__input" data-ja-field="comments" value="' + esc(d.comments || '') + '" autocomplete="off">' +
            '</label></div>' +
            '<section class="jms-tg-ja-v2__card jms-tg-ja-v2__card--path">' +
            '<h4 class="jms-tg-ja-v2__card-title">JSON Path</h4>' +
            '<label class="jms-tg-ja-v2__field">' +
            renderLabel('Assert JSON Path exists') +
            '<input type="text" class="jms-tg-ja-v2__input jms-tg-ja-v2__input--mono hf-mono" data-ja-field="json_path" value="' +
            esc(d.json_path || '$.') + '" autocomplete="off" spellcheck="false" placeholder="$.code">' +
            '</label></section>' +
            '<section class="jms-tg-ja-v2__card jms-tg-ja-v2__card--options">' +
            '<h4 class="jms-tg-ja-v2__card-title">断言选项</h4>' +
            '<div class="jms-tg-ja-v2__chip-row">' +
            renderCheckboxChip('additionally_assert_value', 'Additionally assert value', d.additionally_assert_value) +
            renderCheckboxChip('is_regex', 'Match as regular expression', d.is_regex) +
            '</div></section>' +
            '<section class="jms-tg-ja-v2__card jms-tg-ja-v2__card--expected" data-ja-expected-section>' +
            '<h4 class="jms-tg-ja-v2__card-title">Expected Value</h4>' +
            '<label class="jms-tg-ja-v2__field">' +
            '<textarea class="jms-tg-ja-v2__textarea jms-tg-ja-v2__input--mono hf-mono" data-ja-field="expected" rows="7" spellcheck="false" placeholder="预期值或正则表达式">' +
            esc(d.expected || '') + '</textarea></label>' +
            '<div class="jms-tg-ja-v2__chip-row jms-tg-ja-v2__chip-row--foot">' +
            renderCheckboxChip('expect_null', 'Expect null', d.expect_null) +
            renderCheckboxChip('invert', 'Invert assertion (will fail if above conditions met)', d.invert) +
            '</div></section></div>';
    }

    function renderAssertionBody(d) {
        return renderAssertionBodyV2(d);
    }

    function readAssertionBody(body, modal) {
        body = body || global.document;
        modal = modal || (body.closest ? body.closest('#' + MODAL_ID) : null);
        function chk(name) {
            var el = (modal && modal.querySelector('[data-ja-field="' + name + '"]')) ||
                body.querySelector('[data-ja-field="' + name + '"]');
            return el && el.type === 'checkbox' ? !!el.checked : false;
        }
        function txt(name) {
            var el = body.querySelector('input[data-ja-field="' + name + '"], textarea[data-ja-field="' + name + '"]');
            return el ? el.value : '';
        }
        return {
            name: String(txt('name') || '').trim() || 'JSON断言',
            comments: String(txt('comments') || ''),
            json_path: String(txt('json_path') || '').trim() || '$.',
            additionally_assert_value: chk('additionally_assert_value'),
            is_regex: chk('is_regex'),
            expected: String(txt('expected') || ''),
            expect_null: chk('expect_null'),
            invert: chk('invert')
        };
    }

    /** 对齐 JMeter JSONPathAssertionGui.stateChanged：仅禁用 Expected Value / is_regex，不隐藏 */
    function syncFieldEnabledState(modal) {
        if (!modal) return;
        var assertValue = modal.querySelector('[data-ja-field="additionally_assert_value"]');
        var expectNull = modal.querySelector('[data-ja-field="expect_null"]');
        var expected = modal.querySelector('[data-ja-field="expected"]');
        var isRegex = modal.querySelector('[data-ja-field="is_regex"]');
        var enabled = !!(assertValue && assertValue.checked && expectNull && !expectNull.checked);
        if (expected) expected.disabled = !enabled;
        if (isRegex) isRegex.disabled = !enabled;
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
                assertType: 'json_assert',
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
        if (ev.target.matches('[data-ja-field="additionally_assert_value"], [data-ja-field="expect_null"]')) {
            syncFieldEnabledState(modal);
        }
    }

    function ensureDrawer() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-tg-ja-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-tg-ja-drawer__panel">' +
            '<div class="jms-tg-ja-drawer__head">' +
            '<div class="jms-tg-ja-drawer__head-main">' +
            '<span class="jms-tg-ja-drawer__badge">Assertion</span>' +
            '<h3 class="jms-step-modal__title">JSON断言</h3></div>' +
            '<button type="button" class="jms-tg-ja-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-tg-ja-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-tg-ja-drawer__foot">' +            '<div class="jms-tg-ja-drawer__foot-actions">' +
            '<button type="button" class="jms-btn-ghost jms-tg-ja-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-ja-drawer__save">保存</button>' +
            '</div></div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', onModalClick);
        modal.addEventListener('change', onModalChange);
        modal.querySelector('.jms-tg-ja-drawer__close').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-ja-drawer__cancel').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-ja-drawer__save').addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            saveModal();
        }, true);
        return modal;
    }

    function openModal(assertion) {
        var modal = ensureDrawer();
        var bodyEl = modal.querySelector('.jms-tg-ja-drawer__body');
        if (bodyEl) bodyEl.innerHTML = renderAssertionBody(assertion);
        syncFieldEnabledState(modal);
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function setModalContext(modal, planId, tgId, mode, assertIndex) {
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
                modal.setAttribute('data-assert-mode', mode);
        if (mode === 'edit') modal.setAttribute('data-assert-index', String(assertIndex));
        else modal.removeAttribute('data-assert-index');
    }

    function applyFieldsToAssertion(item, fields) {
        item.type = 'json_assert';
        item.name = fields.name;
        item.comments = fields.comments;
        item.enabled = (global.JmsAssertEnableUi && typeof global.JmsAssertEnableUi.resolveEnabledForSave === 'function')

            ? global.JmsAssertEnableUi.resolveEnabledForSave(item, fields)

            : (fields.enabled !== false);
        item.json_path = fields.json_path;
        item.additionally_assert_value = fields.additionally_assert_value;
        item.is_regex = fields.is_regex;
        item.expected = fields.expected;
        item.expect_null = fields.expect_null;
        item.invert = fields.invert;
        return item;
    }

    function saveModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var mode = modal.getAttribute('data-assert-mode');
        var bodyEl = modal.querySelector('.jms-tg-ja-drawer__body');
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
        if (fields.enabled && !fields.json_path.trim()) {
            global.alert('请填写 Assert JSON Path exists。');
            return;
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
                    ? R.resolvePendingItem(modal, listIf, 'json_assert')
                    : null;
                if (!itemIf) {
                    itemIf = defaultAssertion(listIf.filter(function (a) {
                        return a && a.type === 'json_assert';
                    }).length + 1);
                    listIf.push(itemIf);
                    if (H && typeof H.notifyMountAdded === 'function') H.notifyMountAdded(ifStep, 'ifas:' + (listIf.length - 1));
                }
                applyFieldsToAssertion(itemIf, fields);
                if (R && typeof R.commitPending === 'function') R.commitPending(modal);
            } else {
                var idxIf = parseInt(modal.getAttribute('data-assert-index'), 10);
                var existingIf = listIf[idxIf];
                if (!existingIf || existingIf.type !== 'json_assert') return;
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
                ? R.resolvePendingItem(modal, list, 'json_assert')
                : null;
            if (!item) {
                item = defaultAssertion(list.filter(function (a) {
                    return a && a.type === 'json_assert';
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
            if (!existing || existing.type !== 'json_assert') return;
            applyFieldsToAssertion(existing, fields);
        }
        hideModal(modal);
        markDirtyAndRefreshDetail(planId, tgId);
    }

    function openCreate(planId, tgId) {
        var tg = findTg(planId, tgId);
        if (!tg) return;
        var modal = ensureDrawer();
        var n = ensureAssertions(tg).filter(function (a) { return a && a.type === 'json_assert'; }).length + 1;
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
        var n = (ifStep.assertions || []).filter(function (a) { return a && a.type === 'json_assert'; }).length + 1;
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
        if (!item || item.type !== 'json_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        openModal(item);
    }


    function openEditForIfMount(planId, tgId, ifStepId, assertIndex) {
        var H = global.JmsIfMountSaveHelper;
        var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
        if (!ifStep) return;
        var item = (ifStep.assertions || [])[assertIndex];
        if (!item || item.type !== 'json_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        modal.setAttribute('data-if-mount-if-step-id', ifStepId);
        openModal(item);
    }

    global.JmsTgJsonAssertionUi = {
        ensureDrawer: ensureDrawer,
        openCreate: openCreate,
        openCreateForIfMount: openCreateForIfMount,
        openEditForIfMount: openEditForIfMount,
        openEdit: openEdit,
        defaultAssertion: defaultAssertion
    };
}(typeof window !== 'undefined' ? window : this));
