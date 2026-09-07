/**
 * 线程组 · 随机控制器弹窗 UI（隔离模块 v1 · 仅 modal-tg-random-edit）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-random-edit';
    var UI_VERSION = '1';
    var TARGET = 'tg-random-aux';

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
        var m = getModel();
        if (!m) return null;
        var tg = (m.setup_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var plan = (m.test_plans || []).find(function (p) { return p.id === planId; });
        if (!plan) return null;
        tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        return (m.post_thread_groups || []).find(function (t) { return t.id === tgId; }) || null;
    }

    function isRandomStep(st) {
        return st && st.type === 'random_controller';
    }

    function isNestedLogicStep(st) {
        return st && (st.type === 'if_controller' || st.type === 'random_controller');
    }

    function findStepInList(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (s.id === stepId) { found = s; return true; }
            if (isNestedLogicStep(s) && s.children) {
                found = findStepInList(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function removeStepFromList(list, stepId) {
        if (!list || !stepId) return false;
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s) continue;
            if (s.id === stepId) {
                list.splice(i, 1);
                return true;
            }
            if (isNestedLogicStep(s) && s.children && removeStepFromList(s.children, stepId)) {
                return true;
            }
        }
        return false;
    }

    function findRandomStep(planId, tgId, stepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !stepId) return null;
        var step = findStepInList(tg.steps, stepId);
        return isRandomStep(step) ? step : null;
    }

    function removePendingStep(planId, tgId, stepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !stepId) return false;
        return removeStepFromList(tg.steps, stepId);
    }

    function defaultStepData(seq) {
        return {
            type: 'random_controller',
            name: '随机控制器' + (seq ? ' ' + seq : ''),
            comments: '',
            ignore_sub_controller_blocks: false,
            enabled: true,
            children: []
        };
    }

    function renderLabel(text) {
        return '<span class="jms-tg-random-v1__label">' + esc(text) + '</span>';
    }

    function renderBody(d) {
        d = d || defaultStepData();
        return '<div class="jms-tg-random-v1" data-tg-random-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-tg-random-v1__intro">' +
            '<p class="jms-tg-random-v1__intro-text">随机控制器会随机执行其下的一个子元素。可将多个取样器或逻辑控制器作为子项，运行时仅执行其中之一。</p>' +
            '</div>' +
            '<div class="jms-tg-random-v1__grid jms-tg-random-v1__grid--meta">' +
            '<label class="jms-tg-random-v1__field">' + renderLabel('名称') +
            '<input type="text" class="jms-tg-random-v1__input" data-tg-random-field="name" value="' + esc(d.name || '') + '" placeholder="随机控制器">' +
            '</label>' +
            '<label class="jms-tg-random-v1__field">' + renderLabel('注释') +
            '<input type="text" class="jms-tg-random-v1__input" data-tg-random-field="comments" value="' + esc(d.comments || '') + '" placeholder="可选说明">' +
            '</label></div>' +
            '<section class="jms-tg-random-v1__option-card">' +
            '<label class="jms-tg-random-v1__chk">' +
            '<input type="checkbox" data-tg-random-field="ignore_sub_controller_blocks"' + (d.ignore_sub_controller_blocks ? ' checked' : '') + '>' +
            '<span class="jms-tg-random-v1__chk-body">' +
            '<span class="jms-tg-random-v1__chk-title">忽略子控制器块</span>' +
            '<span class="jms-tg-random-v1__chk-desc">Ignore sub-controller blocks — 勾选后，嵌套的 Transaction / Loop 等控制器块会被视为单个随机候选。</span>' +
            '</span></label></section>' +
            '<div class="jms-tg-random-v1__foot-row">' +
            '<label class="jms-tg-random-v1__chk jms-tg-random-v1__chk--enabled">' +
            '<input type="checkbox" data-tg-random-field="enabled"' + (d.enabled !== false ? ' checked' : '') + '>' +
            '<span>启用</span></label></div></div>';
    }

    function readForm(modal) {
        var body = modal.querySelector('.jms-tg-random-drawer__body');
        function field(name) {
            var el = body.querySelector('[data-tg-random-field="' + name + '"]');
            return el ? el.value : '';
        }
        function checked(name) {
            var el = body.querySelector('[data-tg-random-field="' + name + '"]');
            return el ? !!el.checked : false;
        }
        return {
            type: 'random_controller',
            name: field('name').trim() || '随机控制器',
            comments: field('comments'),
            ignore_sub_controller_blocks: checked('ignore_sub_controller_blocks'),
            enabled: checked('enabled')
        };
    }

    function markDirtyAndSync() {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        if (vb && typeof vb.scheduleRender === 'function') vb.scheduleRender();
        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.syncAll === 'function') {
            global.JmsTgTreeShell.syncAll(true);
        }
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function hideModal(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-plan-id');
        modal.removeAttribute('data-tg-id');
        modal.removeAttribute('data-step-id');
        modal.removeAttribute('data-edit-mode');
    }

    function cancelModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;
        var isCreate = modal.getAttribute('data-edit-mode') === 'create';
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        hideModal(modal);
        if (isCreate && planId && tgId && stepId && removePendingStep(planId, tgId, stepId)) {
            markDirtyAndSync();
        }
    }

    function ensureModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-tg-random-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-tg-random-drawer__panel">' +
            '<div class="jms-tg-random-drawer__head">' +
            '<div class="jms-tg-random-drawer__head-main">' +
            '<span class="jms-tg-random-drawer__badge">Random Controller</span>' +
            '<h3 class="jms-step-modal__title">随机控制器</h3>' +
            '</div>' +
            '<button type="button" class="jms-tg-random-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-tg-random-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-tg-random-drawer__foot">' +
            '<button type="button" class="jms-btn-ghost jms-tg-random-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-random-drawer__save">保存</button>' +
            '</div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal) cancelModal();
        });
        var panel = modal.querySelector('.jms-tg-random-drawer__panel');
        if (panel) panel.addEventListener('click', function (ev) { ev.stopPropagation(); });
        modal.querySelector('.jms-tg-random-drawer__close').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-random-drawer__cancel').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-random-drawer__save').addEventListener('click', saveFromModal);
        if (!global.document.body.dataset.jmsTgRandomEscBound) {
            global.document.body.dataset.jmsTgRandomEscBound = '1';
            global.document.addEventListener('keydown', function (ev) {
                if (ev.key !== 'Escape') return;
                var m = global.document.getElementById(MODAL_ID);
                if (m && m.classList.contains('jms-modal-open')) cancelModal();
            });
        }
        return modal;
    }

    function openModal() {
        var modal = ensureModal();
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function openEditor(planId, tgId, stepId, isCreate, retryCount) {
        retryCount = retryCount || 0;
        var step = findRandomStep(planId, tgId, stepId);
        if (!step) {
            if (isCreate && retryCount < 8) {
                global.setTimeout(function () {
                    openEditor(planId, tgId, stepId, isCreate, retryCount + 1);
                }, 40);
            } else if (isCreate && planId && tgId && stepId) {
                removePendingStep(planId, tgId, stepId);
                markDirtyAndSync();
            }
            return;
        }
        var modal = ensureModal();
        modal.setAttribute('data-edit-target', TARGET);
        modal.setAttribute('data-edit-mode', isCreate ? 'create' : 'edit');
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-step-id', stepId);
        var bodyEl = modal.querySelector('.jms-tg-random-drawer__body');
        if (bodyEl) bodyEl.innerHTML = renderBody(step);
        openModal();
        var first = modal.querySelector('[data-tg-random-field="name"]');
        if (first) {
            global.setTimeout(function () {
                try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
            }, 60);
        }
    }

    function openEditorAfterAppend(planId, tgId, stepId) {
        global.requestAnimationFrame(function () {
            openEditor(planId, tgId, stepId, true, 0);
        });
    }

    function saveFromModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal || modal.getAttribute('data-edit-target') !== TARGET) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var step = findRandomStep(planId, tgId, stepId);
        if (!step) { hideModal(modal); return; }
        var data = readForm(modal);
        Object.keys(data).forEach(function (k) {
            if (k !== 'type') step[k] = data[k];
        });
        if (!step.children) step.children = [];
        hideModal(modal);
        markDirtyAndSync();
    }

    function onRootClick(ev) {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var btn = ev.target.closest('.jms-btn-edit-random');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        var card = btn.closest('.jms-random-card') || btn.closest('.jms-aux-card');
        if (!card) return;
        var actions = btn.closest('.lth-step-actions');
        if (actions) actions.classList.remove('is-open', 'is-hover');
        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.readModelFromDom === 'function') {
            global.JmsVisualBuilder.readModelFromDom();
        }
        openEditor(card.getAttribute('data-plan-id'), card.getAttribute('data-tg-id'), card.getAttribute('data-step-id'), false);
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsTgRandomUiBound === '1') return;
        global.document.body.dataset.jmsTgRandomUiBound = '1';
        global.document.addEventListener('click', onRootClick, true);
        ensureModal();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgRandomControllerUi = {
        UI_VERSION: UI_VERSION,
        defaultStepData: defaultStepData,
        ensureModal: ensureModal,
        openEditor: openEditor,
        openEditorAfterAppend: openEditorAfterAppend,
        close: cancelModal,
        isRandomTarget: function (modal) {
            return !!(modal && modal.getAttribute('data-edit-target') === TARGET);
        }
    };
}(typeof window !== 'undefined' ? window : this));
