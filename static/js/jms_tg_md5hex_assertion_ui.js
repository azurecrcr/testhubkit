/**
 * 线程组 · MD5Hex 断言弹窗（v1 · 独立模块 · #modal-tg-md5hex-assert-edit）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-md5hex-assert-edit';
    var UI_VERSION = '3';

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
        return 'MD5Hex断言' + (index ? ' ' + index : '');
    }

    function defaultAssertion(index) {
        return {
            type: 'md5hex_assert',
            name: defaultName(index),
            comments: '',
            enabled: true,
            md5_hex: ''
        };
    }

    function renderLabel(text, en) {
        return '<span class="jms-tg-m5-v1__label">' + esc(text) +
            (en ? '<span class="jms-tg-m5-v1__label-en">' + esc(en) + '</span>' : '') +
            '</span>';
    }

    function renderAssertionBody(d) {
        d = d || defaultAssertion(0);
        return '<div class="jms-tg-m5-v1" data-tg-m5-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-tg-m5-v1__grid jms-tg-m5-v1__grid--meta">' +
            '<label class="jms-tg-m5-v1__field">' + renderLabel('名称') +
            '<input type="text" class="jms-tg-m5-v1__input" data-m5-field="name" value="' + esc(d.name || '') + '" autocomplete="off">' +
            '</label>' +
            '<label class="jms-tg-m5-v1__field">' + renderLabel('注释') +
            '<input type="text" class="jms-tg-m5-v1__input" data-m5-field="comments" value="' + esc(d.comments || '') + '" autocomplete="off">' +
            '</label></div>' +
            '<section class="jms-tg-m5-v1__card">' +
            '<h4 class="jms-tg-m5-v1__card-title">要断言的 MD5Hex</h4>' +
            '<p class="jms-tg-m5-v1__hint">对响应体计算 MD5 后与下方 32 位十六进制值比对（小写）。</p>' +
            '<label class="jms-tg-m5-v1__field">' + renderLabel('MD5Hex', '32-char hex') +
            '<input type="text" class="jms-tg-m5-v1__input jms-tg-m5-v1__input--hex hf-mono" data-m5-field="md5_hex" value="' +
            esc(d.md5_hex != null ? String(d.md5_hex) : '') + '" autocomplete="off" spellcheck="false" maxlength="32">' +
            '</label></section></div>';
    }

    function readAssertionBody(body, modal) {
        body = body || global.document;
        modal = modal || (body.closest ? body.closest('#' + MODAL_ID) : null);
        function txt(name) {
            var el = body.querySelector('input[data-m5-field="' + name + '"], textarea[data-m5-field="' + name + '"]');
            return el ? el.value : '';
        }
        return {
            name: String(txt('name') || '').trim() || 'MD5Hex断言',
            comments: String(txt('comments') || ''),
            md5_hex: String(txt('md5_hex') || '').trim().toLowerCase()
        };
    }

    function isValidMd5Hex(value) {
        return /^[a-f0-9]{32}$/.test(value);
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
                assertType: 'md5hex_assert',
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

    function ensureDrawer() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-tg-m5-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-tg-m5-drawer__panel">' +
            '<div class="jms-tg-m5-drawer__head">' +
            '<div class="jms-tg-m5-drawer__head-main">' +
            '<span class="jms-tg-m5-drawer__badge">Assertion</span>' +
            '<h3 class="jms-step-modal__title">MD5Hex断言</h3></div>' +
            '<button type="button" class="jms-tg-m5-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-tg-m5-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-tg-m5-drawer__foot">' +            '<div class="jms-tg-m5-drawer__foot-actions">' +
            '<button type="button" class="jms-btn-ghost jms-tg-m5-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-m5-drawer__save">保存</button>' +
            '</div></div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', onModalClick);
        modal.querySelector('.jms-tg-m5-drawer__close').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-m5-drawer__cancel').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-m5-drawer__save').addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            saveModal();
        }, true);
        return modal;
    }

    function openModal(assertion) {
        var modal = ensureDrawer();
        var bodyEl = modal.querySelector('.jms-tg-m5-drawer__body');
        if (bodyEl) bodyEl.innerHTML = renderAssertionBody(assertion);
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
        item.type = 'md5hex_assert';
        item.name = fields.name;
        item.comments = fields.comments;
        item.enabled = (global.JmsAssertEnableUi && typeof global.JmsAssertEnableUi.resolveEnabledForSave === 'function')

            ? global.JmsAssertEnableUi.resolveEnabledForSave(item, fields)

            : (fields.enabled !== false);
        item.md5_hex = fields.md5_hex;
        return item;
    }

    function notifyMd5hexValidation(modal, code) {
        if (global.JmsAssertValidationNotice &&
            typeof global.JmsAssertValidationNotice.notifyMd5hexSave === 'function') {
            global.JmsAssertValidationNotice.notifyMd5hexSave(modal, code, 'tg');
            return;
        }
        var msgs = {
            hex_empty: '请填写 MD5Hex 值。',
            hex_invalid: 'MD5Hex 必须为 32 位十六进制字符（0-9、a-f）。'
        };
        global.alert(msgs[code] || '');
    }

    function saveModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var mode = modal.getAttribute('data-assert-mode');
        var bodyEl = modal.querySelector('.jms-tg-m5-drawer__body');
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
            if (!fields.md5_hex) {
                notifyMd5hexValidation(modal, 'hex_empty');
                return;
            }
            if (!isValidMd5Hex(fields.md5_hex)) {
                notifyMd5hexValidation(modal, 'hex_invalid');
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
                    ? R.resolvePendingItem(modal, listIf, 'md5hex_assert')
                    : null;
                if (!itemIf) {
                    itemIf = defaultAssertion(listIf.filter(function (a) {
                        return a && a.type === 'md5hex_assert';
                    }).length + 1);
                    listIf.push(itemIf);
                    if (H && typeof H.notifyMountAdded === 'function') H.notifyMountAdded(ifStep, 'ifas:' + (listIf.length - 1));
                }
                applyFieldsToAssertion(itemIf, fields);
                if (R && typeof R.commitPending === 'function') R.commitPending(modal);
            } else {
                var idxIf = parseInt(modal.getAttribute('data-assert-index'), 10);
                var existingIf = listIf[idxIf];
                if (!existingIf || existingIf.type !== 'md5hex_assert') return;
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
                ? R.resolvePendingItem(modal, list, 'md5hex_assert')
                : null;
            if (!item) {
                item = defaultAssertion(list.filter(function (a) {
                    return a && a.type === 'md5hex_assert';
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
            if (!existing || existing.type !== 'md5hex_assert') return;
            applyFieldsToAssertion(existing, fields);
        }
        hideModal(modal);
        markDirtyAndRefreshDetail(planId, tgId);
    }

    function openCreate(planId, tgId) {
        var tg = findTg(planId, tgId);
        if (!tg) return;
        var modal = ensureDrawer();
        var n = ensureAssertions(tg).filter(function (a) { return a && a.type === 'md5hex_assert'; }).length + 1;
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
        var n = (ifStep.assertions || []).filter(function (a) { return a && a.type === 'md5hex_assert'; }).length + 1;
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
        if (!item || item.type !== 'md5hex_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        openModal(item);
    }


    function openEditForIfMount(planId, tgId, ifStepId, assertIndex) {
        var H = global.JmsIfMountSaveHelper;
        var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
        if (!ifStep) return;
        var item = (ifStep.assertions || [])[assertIndex];
        if (!item || item.type !== 'md5hex_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        modal.setAttribute('data-if-mount-if-step-id', ifStepId);
        openModal(item);
    }

    global.JmsTgMd5hexAssertionUi = {
        ensureDrawer: ensureDrawer,
        openCreate: openCreate,
        openCreateForIfMount: openCreateForIfMount,
        openEditForIfMount: openEditForIfMount,
        openEdit: openEdit,
        defaultAssertion: defaultAssertion
    };
}(typeof window !== 'undefined' ? window : this));
