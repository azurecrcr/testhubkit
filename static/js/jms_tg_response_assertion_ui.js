/**
 * 线程组 · 响应断言弹窗（v1 · 独立模块 · #modal-tg-response-assert-edit）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-response-assert-edit';
    var UI_VERSION = '6';

    var APPLY_TO_OPTIONS = [
        { val: 'main_and_sub', label: 'Main sample and sub-samples' },
        { val: 'main_only', label: 'Main sample only' },
        { val: 'sub_only', label: 'Sub-samples only' },
        { val: 'jmeter_variable', label: 'JMeter Variable Name to use' }
    ];

    var TEST_FIELD_OPTIONS = [
        { val: 'response_text', label: '响应文本' },
        { val: 'response_code', label: '响应代码' },
        { val: 'response_message', label: '响应信息' },
        { val: 'response_headers', label: 'Response Headers' },
        { val: 'request_headers', label: 'Request Headers' },
        { val: 'url_sample', label: 'URL样本' },
        { val: 'document', label: 'Document (text)' },
        { val: 'request_data', label: 'Request Data' }
    ];

    var MATCH_MODE_OPTIONS = [
        { val: 'contains', label: '包括' },
        { val: 'matches', label: '匹配' },
        { val: 'equals', label: 'Equals' },
        { val: 'substring', label: 'Substring' }
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
        return '响应断言' + (index ? ' ' + index : '');
    }

    function defaultAssertion(index) {
        return {
            type: 'response_assert',
            name: defaultName(index),
            comments: '',
            enabled: true,
            apply_to: 'main_only',
            jmeter_variable: '',
            test_field: 'response_text',
            ignore_status: false,
            match_mode: 'substring',
            match_not: false,
            match_or: false,
            patterns: [],
            custom_message: ''
        };
    }

    function renderLabel(text) {
        return '<span class="jms-tg-ra-v1__label">' + esc(text) + '</span>';
    }

    function renderRadioGroup(name, options, current, field) {
        return '<div class="jms-tg-ra-v1__radio-grid" data-ra-field="' + field + '">' +
            options.map(function (o) {
                return '<label class="jms-tg-ra-v1__radio">' +
                    '<input type="radio" name="' + esc(name) + '" value="' + esc(o.val) + '"' +
                    (current === o.val ? ' checked' : '') + '>' +
                    '<span>' + esc(o.label) + '</span></label>';
            }).join('') + '</div>';
    }

    function renderPatternsEditor(patterns) {
        patterns = Array.isArray(patterns) ? patterns : [];
        if (!patterns.length) {
            return '<div class="jms-tg-ra-v1__patterns-list" data-ra-patterns-list>' +
                '<p class="jms-tg-ra-v1__patterns-empty">暂无模式，点击「添加」新增</p></div>';
        }
        var rows = patterns.map(function (p) {
            return '<div class="jms-tg-ra-v1__pat-row">' +
                '<input type="text" class="jms-tg-ra-v1__pat-input hf-mono" spellcheck="false" value="' +
                esc(p) + '" autocomplete="off">' +
                '</div>';
        }).join('');
        return '<div class="jms-tg-ra-v1__patterns-list" data-ra-patterns-list>' + rows + '</div>';
    }

    function renderMatchRuleRow(d) {
        var mode = d.match_mode || 'substring';
        var modesHtml = MATCH_MODE_OPTIONS.map(function (o) {
            return '<label class="jms-tg-ra-v1__seg">' +
                '<input type="radio" name="ra-match-mode" value="' + esc(o.val) + '"' +
                (mode === o.val ? ' checked' : '') + '>' +
                '<span>' + esc(o.label) + '</span></label>';
        }).join('');
        return '<div class="jms-tg-ra-v1__match-inline">' +
            '<div class="jms-tg-ra-v1__seg-grid" data-ra-field="match_mode">' + modesHtml + '</div>' +
            '<div class="jms-tg-ra-v1__match-flags">' +
            '<label class="jms-tg-ra-v1__seg jms-tg-ra-v1__seg--chk">' +
            '<input type="checkbox" data-ra-field="match_not"' + (d.match_not ? ' checked' : '') + '>' +
            '<span>否</span></label>' +
            '<label class="jms-tg-ra-v1__seg jms-tg-ra-v1__seg--chk">' +
            '<input type="checkbox" data-ra-field="match_or"' + (d.match_or ? ' checked' : '') + '>' +
            '<span>或者</span></label>' +
            '</div></div>';
    }

    function renderAssertionBody(d) {
        d = d || defaultAssertion(0);
        var patterns = Array.isArray(d.patterns) ? d.patterns : [];
        var applyTo = d.apply_to || 'main_only';
        return '<div class="jms-tg-ra-v1" data-tg-ra-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-tg-ra-v1__grid jms-tg-ra-v1__grid--meta">' +
            '<label class="jms-tg-ra-v1__field">' + renderLabel('名称') +
            '<input type="text" class="jms-tg-ra-v1__input" data-ra-field="name" value="' + esc(d.name || '') + '" autocomplete="off">' +
            '</label>' +
            '<label class="jms-tg-ra-v1__field">' + renderLabel('注释') +
            '<input type="text" class="jms-tg-ra-v1__input" data-ra-field="comments" value="' + esc(d.comments || '') + '" autocomplete="off">' +
            '</label></div>' +
            '<div class="jms-tg-ra-v1__grid jms-tg-ra-v1__grid--scope">' +
            '<section class="jms-tg-ra-v1__card">' +
            '<h4 class="jms-tg-ra-v1__card-title">Apply to</h4>' +
            renderRadioGroup('ra-apply-to', APPLY_TO_OPTIONS, applyTo, 'apply_to') +
            '<label class="jms-tg-ra-v1__field jms-tg-ra-v1__field--var' +
            (applyTo === 'jmeter_variable' ? '' : ' is-hidden') + '" data-ra-var-wrap>' +
            renderLabel('Variable Name') +
            '<input type="text" class="jms-tg-ra-v1__input hf-mono" data-ra-field="jmeter_variable" value="' +
            esc(d.jmeter_variable || '') + '" autocomplete="off">' +
            '</label></section>' +
            '<section class="jms-tg-ra-v1__card jms-tg-ra-v1__card--field-test">' +
            '<div class="jms-tg-ra-v1__card-head">' +
            '<h4 class="jms-tg-ra-v1__card-title">测试字段</h4>' +
            '<label class="jms-tg-ra-v1__chk jms-tg-ra-v1__chk--ignore">' +
            '<input type="checkbox" data-ra-field="ignore_status"' + (d.ignore_status ? ' checked' : '') + '>' +
            '<span>忽略状态</span></label></div>' +
            renderRadioGroup('ra-test-field', TEST_FIELD_OPTIONS, d.test_field || 'response_text', 'test_field') +
            '</section></div>' +
            '<section class="jms-tg-ra-v1__card jms-tg-ra-v1__card--match">' +
            '<h4 class="jms-tg-ra-v1__card-title">模式匹配规则</h4>' +
            renderMatchRuleRow(d) +
            '</section>' +
            '<div class="jms-tg-ra-v1__grid jms-tg-ra-v1__grid--bottom">' +
            '<section class="jms-tg-ra-v1__card jms-tg-ra-v1__card--patterns">' +
            '<h4 class="jms-tg-ra-v1__card-title">测试模式</h4>' +
            renderPatternsEditor(patterns) +
            '<div class="jms-tg-ra-v1__pattern-actions">' +
            '<button type="button" class="jms-tg-ra-v1__pat-btn" data-ra-pat-add>添加</button>' +
            '<button type="button" class="jms-tg-ra-v1__pat-btn jms-tg-ra-v1__pat-btn--danger" data-ra-pat-del>删除</button>' +
            '</div></section>' +
            '<section class="jms-tg-ra-v1__card jms-tg-ra-v1__card--message">' +
            '<h4 class="jms-tg-ra-v1__card-title">Custom failure message</h4>' +
            '<textarea class="jms-tg-ra-v1__textarea" data-ra-field="custom_message" rows="6" spellcheck="false">' +
            esc(d.custom_message || '') + '</textarea>' +
            '</section></div></div>';
    }

    function readRadioField(body, field) {
        var wrap = body.querySelector('[data-ra-field="' + field + '"]');
        if (!wrap) return '';
        var checked = wrap.querySelector('input[type="radio"]:checked');
        return checked ? checked.value : '';
    }

    function readPatternsFromEditor(body) {
        var listEl = body.querySelector('[data-ra-patterns-list]');
        if (!listEl) return [];
        var out = [];
        listEl.querySelectorAll('.jms-tg-ra-v1__pat-input').forEach(function (inp) {
            var v = String(inp.value || '').trim();
            if (v) out.push(v);
        });
        return out;
    }

    function readAssertionBody(body, modal) {
        body = body || global.document;
        modal = modal || (body.closest ? body.closest('#' + MODAL_ID) : null);
        function chk(name) {
            var el = (modal && modal.querySelector('[data-ra-field="' + name + '"]')) ||
                body.querySelector('[data-ra-field="' + name + '"]');
            return el && el.type === 'checkbox' ? !!el.checked : false;
        }
        function txt(name) {
            var el = body.querySelector('input[data-ra-field="' + name + '"], textarea[data-ra-field="' + name + '"]');
            return el ? el.value : '';
        }
        var Jmx = global.JmsHttpResponseAssertionJmx;
        var matchMode = readRadioField(body, 'match_mode') || 'substring';
        var matchNot = chk('match_not');
        var matchOr = chk('match_or');
        var testType = Jmx && typeof Jmx.encodeTestType === 'function'
            ? Jmx.encodeTestType(matchMode, matchNot, matchOr) : 16;
        return {
            name: String(txt('name') || '').trim() || '响应断言',
            comments: String(txt('comments') || ''),
            apply_to: readRadioField(body, 'apply_to') || 'main_only',
            jmeter_variable: String(txt('jmeter_variable') || '').trim(),
            test_field: readRadioField(body, 'test_field') || 'response_text',
            ignore_status: chk('ignore_status'),
            match_mode: matchMode,
            match_not: matchNot,
            match_or: matchOr,
            jmeter_test_type: testType,
            patterns: readPatternsFromEditor(body),
            custom_message: String(txt('custom_message') || '')
        };
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
                assertType: 'response_assert',
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

    function getPatternsListEl(modal) {
        return modal && modal.querySelector('[data-ra-patterns-list]');
    }

    function clearPatternsPlaceholder(listEl) {
        if (!listEl) return;
        var empty = listEl.querySelector('.jms-tg-ra-v1__patterns-empty');
        if (empty) empty.parentNode.removeChild(empty);
    }

    function addPatternRow(listEl, text, autoFocus) {
        if (!listEl) return null;
        clearPatternsPlaceholder(listEl);
        var row = global.document.createElement('div');
        row.className = 'jms-tg-ra-v1__pat-row';
        var input = global.document.createElement('input');
        input.type = 'text';
        input.className = 'jms-tg-ra-v1__pat-input hf-mono';
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('autocomplete', 'off');
        input.value = text == null ? '' : String(text);
        row.appendChild(input);
        listEl.appendChild(row);
        if (autoFocus) {
            input.focus();
            var len = input.value.length;
            input.setSelectionRange(len, len);
        }
        return input;
    }

    function deletePatternRows(listEl) {
        if (!listEl) return;
        var selected = listEl.querySelectorAll('.jms-tg-ra-v1__pat-row.is-selected');
        if (selected.length) {
            Array.prototype.forEach.call(selected, function (row) {
                if (row.parentNode) row.parentNode.removeChild(row);
            });
            return;
        }
        var focused = listEl.querySelector('.jms-tg-ra-v1__pat-input:focus');
        if (focused) {
            var focusedRow = focused.closest('.jms-tg-ra-v1__pat-row');
            if (focusedRow && focusedRow.parentNode) {
                focusedRow.parentNode.removeChild(focusedRow);
                return;
            }
        }
        var rows = listEl.querySelectorAll('.jms-tg-ra-v1__pat-row');
        if (rows.length && rows[rows.length - 1].parentNode) {
            rows[rows.length - 1].parentNode.removeChild(rows[rows.length - 1]);
        }
    }

    function onModalClick(ev) {
        var modal = ev.target.closest('#' + MODAL_ID);
        if (!modal) return;
        if (ev.target === modal) {
            cancelModal();
            return;
        }
        if (ev.target.closest('[data-ra-pat-add]')) {
            ev.preventDefault();
            addPatternRow(getPatternsListEl(modal), '', true);
            return;
        }
        if (ev.target.closest('[data-ra-pat-del]')) {
            ev.preventDefault();
            deletePatternRows(getPatternsListEl(modal));
            return;
        }
        var patRow = ev.target.closest('.jms-tg-ra-v1__pat-row');
        if (patRow && ev.target === patRow) {
            if (!ev.ctrlKey && !ev.metaKey) {
                modal.querySelectorAll('.jms-tg-ra-v1__pat-row.is-selected').forEach(function (row) {
                    row.classList.remove('is-selected');
                });
            }
            patRow.classList.toggle('is-selected');
        }
    }

    function onModalChange(ev) {
        var modal = ev.target.closest('#' + MODAL_ID);
        if (!modal) return;
        if (ev.target.matches('input[type="radio"][name="ra-apply-to"]')) {
            var wrap = modal.querySelector('[data-ra-var-wrap]');
            if (wrap) wrap.classList.toggle('is-hidden', ev.target.value !== 'jmeter_variable');
        }
    }

    function ensureDrawer() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-tg-ra-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-tg-ra-drawer__panel">' +
            '<div class="jms-tg-ra-drawer__head">' +
            '<div class="jms-tg-ra-drawer__head-main">' +
            '<span class="jms-tg-ra-drawer__badge">Assertion</span>' +
            '<h3 class="jms-step-modal__title">响应断言</h3></div>' +
            '<button type="button" class="jms-tg-ra-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-tg-ra-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-tg-ra-drawer__foot">' +            '<div class="jms-tg-ra-drawer__foot-actions">' +
            '<button type="button" class="jms-btn-ghost jms-tg-ra-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-ra-drawer__save">保存</button>' +
            '</div></div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', onModalClick);
        modal.addEventListener('change', onModalChange);
        modal.querySelector('.jms-tg-ra-drawer__close').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-ra-drawer__cancel').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-ra-drawer__save').addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            saveModal();
        }, true);
        return modal;
    }

    function openModal(assertion) {
        var modal = ensureDrawer();
        var bodyEl = modal.querySelector('.jms-tg-ra-drawer__body');
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
        item.type = 'response_assert';
        item.name = fields.name;
        item.comments = fields.comments;
        item.enabled = (global.JmsAssertEnableUi && typeof global.JmsAssertEnableUi.resolveEnabledForSave === 'function')

            ? global.JmsAssertEnableUi.resolveEnabledForSave(item, fields)

            : (fields.enabled !== false);
        item.apply_to = fields.apply_to;
        item.jmeter_variable = fields.jmeter_variable;
        item.test_field = fields.test_field;
        item.ignore_status = fields.ignore_status;
        item.match_mode = fields.match_mode;
        item.match_not = fields.match_not;
        item.match_or = fields.match_or;
        item.jmeter_test_type = fields.jmeter_test_type;
        item.patterns = fields.patterns.slice();
        item.custom_message = fields.custom_message;
        return item;
    }

    function saveModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var mode = modal.getAttribute('data-assert-mode');
        var ifStepId = modal.getAttribute('data-if-mount-if-step-id');
        var bodyEl = modal.querySelector('.jms-tg-ra-drawer__body');
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
        if (fields.enabled && !fields.patterns.length) {
            if (global.JmsAssertValidationNotice &&
                typeof global.JmsAssertValidationNotice.showPatternsRequired === 'function') {
                global.JmsAssertValidationNotice.showPatternsRequired(modal, 'tg');
            } else {
                global.alert('请至少添加一个测试模式。');
            }
            return;
        }
        if (ifStepId) {
            var H = global.JmsIfMountSaveHelper;
            var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
            if (!ifStep) return;
            if (!Array.isArray(ifStep.assertions)) ifStep.assertions = [];
            var listIf = ifStep.assertions;
            if (mode === 'create') {
                var R = global.JmsAssertCreateCancelRollback;
                var itemIf = R && typeof R.resolvePendingItem === 'function'
                    ? R.resolvePendingItem(modal, listIf, 'response_assert')
                    : null;
                if (!itemIf) {
                    itemIf = defaultAssertion(listIf.filter(function (a) {
                        return a && a.type === 'response_assert';
                    }).length + 1);
                    listIf.push(itemIf);
                    if (H && typeof H.notifyMountAdded === 'function') H.notifyMountAdded(ifStep, 'ifas:' + (listIf.length - 1));
                }
                applyFieldsToAssertion(itemIf, fields);
                if (R && typeof R.commitPending === 'function') R.commitPending(modal);
            } else {
                var idxIf = parseInt(modal.getAttribute('data-assert-index'), 10);
                var existingIf = listIf[idxIf];
                if (!existingIf || existingIf.type !== 'response_assert') return;
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
                ? R.resolvePendingItem(modal, list, 'response_assert')
                : null;
            if (!item) {
                item = defaultAssertion(list.filter(function (a) {
                    return a && a.type === 'response_assert';
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
            if (!existing || existing.type !== 'response_assert') return;
            applyFieldsToAssertion(existing, fields);
        }
        hideModal(modal);
        markDirtyAndRefreshDetail(planId, tgId);
    }

    function openCreate(planId, tgId) {
        var tg = findTg(planId, tgId);
        if (!tg) return;
        var modal = ensureDrawer();
        var n = ensureAssertions(tg).filter(function (a) { return a && a.type === 'response_assert'; }).length + 1;
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
        var n = (ifStep.assertions || []).filter(function (a) { return a && a.type === 'response_assert'; }).length + 1;
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
        if (!item || item.type !== 'response_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        openModal(item);
    }


    function openEditForIfMount(planId, tgId, ifStepId, assertIndex) {
        var H = global.JmsIfMountSaveHelper;
        var ifStep = H && typeof H.getIf === 'function' ? H.getIf(planId, tgId, ifStepId) : null;
        if (!ifStep) return;
        var item = (ifStep.assertions || [])[assertIndex];
        if (!item || item.type !== 'response_assert') return;
        var modal = ensureDrawer();
        setModalContext(modal, planId, tgId, 'edit', assertIndex);
        modal.setAttribute('data-if-mount-if-step-id', ifStepId);
        openModal(item);
    }

    global.JmsTgResponseAssertionUi = {
        ensureDrawer: ensureDrawer,
        openCreate: openCreate,
        openCreateForIfMount: openCreateForIfMount,
        openEditForIfMount: openEditForIfMount,
        openEdit: openEdit,
        defaultAssertion: defaultAssertion
    };
}(typeof window !== 'undefined' ? window : this));
